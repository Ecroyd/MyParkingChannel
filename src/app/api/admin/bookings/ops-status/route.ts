import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { applyBookingOccupancyAction } from '@/lib/ops/occupancyAction';
import { z } from 'zod';

const actionSchema = z.enum([
  'reserved',
  'arrived',
  'arrived_key_taken',
  'take_key',
  'departed',
  'no_show',
  'cancelled',
]);

const bodySchema = z.object({
  bookingId: z.string().uuid(),
  action: actionSchema,
  operationId: z.string().uuid().optional(),
  source: z.enum(['manual', 'bulk', 'anpr', 'qr', 'api', 'correction']).optional(),
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const body = bodySchema.parse(await req.json());
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
    }

    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('id, tenant_id, reference')
      .eq('id', body.bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const { data: membership, error: membershipError } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', booking.tenant_id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    const result = await applyBookingOccupancyAction({
      bookingId: body.bookingId,
      action: body.action,
      actorUserId: user.id,
      source: body.source ?? (body.operationId ? 'bulk' : 'manual'),
      operationId: body.operationId ?? null,
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ops-status:update:${requestId}] complete`, {
        via: result.via,
        delta: result.delta,
        idempotent: result.idempotent,
      });
    }

    return NextResponse.json({
      booking: result.booking,
      occupancy: {
        delta: result.delta,
        eventId: result.eventId,
        idempotent: result.idempotent,
      },
    });
  } catch (err: unknown) {
    console.error(`[ops-status:update:${requestId}] failed`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
