import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { applyBookingOccupancyAction, type OccupancyOpsAction } from '@/lib/ops/occupancyAction';
import { z } from 'zod';

const bodySchema = z.object({
  gateStatus: z
    .enum([
      'reserved',
      'arrived',
      'departed',
      'cancelled',
      'no_show',
      'take_key',
      'arrived_key_taken',
    ])
    .nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { gateStatus } = bodySchema.parse(await req.json());
    const { id: bookingId } = await params;

    if (!gateStatus) {
      return NextResponse.json({ error: 'gateStatus required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
    }

    const { data: booking } = await adminClient
      .from('bookings')
      .select('id, tenant_id')
      .eq('id', bookingId)
      .single();

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const { data: membership } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', booking.tenant_id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    const result = await applyBookingOccupancyAction({
      bookingId,
      action: gateStatus as OccupancyOpsAction,
      actorUserId: user.id,
      source: 'manual',
    });

    return NextResponse.json({ booking: result.booking }, { status: 200 });
  } catch (err: unknown) {
    console.error('Gate status API error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
