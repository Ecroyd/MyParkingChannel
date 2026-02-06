import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { OPS_STATUS, type OpsStatus } from '@/lib/opsStatuses';
import { BookingHighlightCode } from '@/types/bookings';

const bodySchema = z.object({
  opsStatus: z
    .enum([
      OPS_STATUS.ARRIVED,
      OPS_STATUS.NO_SHOW,
      OPS_STATUS.TAKE_KEY,
      OPS_STATUS.ARRIVED_KEY_TAKEN,
      OPS_STATUS.DEPARTED,
    ] as const)
    .nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { opsStatus } = bodySchema.parse(await req.json());
    const { id: bookingId } = await params;

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
    }

    const { data: userTenants, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (userTenantsError || !userTenants?.length) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    const defaultTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;
    const userId = user.id;
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      ops_status: opsStatus,
    };

    if (opsStatus === null) {
      // Clear ops status only; leave gate_status and booking.status unchanged
    } else {
      // Take Key / Arrived & Key Taken: set highlight_code to 'key' (same as existing key logic)
      if (opsStatus === OPS_STATUS.TAKE_KEY || opsStatus === OPS_STATUS.ARRIVED_KEY_TAKEN) {
        (updates as Record<string, string>).highlight_code = 'key';
      }

      // Soft-hide: when Departed or No Show, set ops_hidden so UI filters by default; "Show hidden" reveals
      if (opsStatus === OPS_STATUS.DEPARTED || opsStatus === OPS_STATUS.NO_SHOW) {
        updates.ops_hidden = true;
        updates.ops_hidden_reason = opsStatus;
        updates.ops_hidden_at = now;
        updates.ops_hidden_by = userId;
      }
    }

    const { data, error } = await adminClient
      .from('bookings')
      .update(updates)
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .select('*')
      .single();

    if (error) {
      console.error('Error updating ops status', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ booking: data }, { status: 200 });
  } catch (err: any) {
    console.error('Ops status API error', err);
    return NextResponse.json(
      { error: err?.message ?? 'Unknown error' },
      { status: 400 }
    );
  }
}
