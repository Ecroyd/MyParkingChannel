import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  tenantId: z.string().uuid(),
  highlightCode: z.enum(['none', 'dot_green', 'dot_amber', 'dot_red', 'key']),
});

export async function PATCH(req: NextRequest) {
  try {
    const { bookingId, tenantId, highlightCode } = bodySchema.parse(await req.json());

    const supabase = await createServerClient();
    const adminClient = await createAdminClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    const { data: updated, error: updateError } = await adminClient
      .from('bookings')
      .update({ highlight_code: highlightCode })
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .select('id, highlight_code')
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, highlight_code: updated.highlight_code });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    console.error('[admin/bookings/highlight]', err);
    return NextResponse.json({ error: 'Unexpected error updating highlight' }, { status: 500 });
  }
}
