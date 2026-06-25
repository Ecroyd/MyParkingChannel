import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
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
});

type OpsAction = z.infer<typeof actionSchema>;
type CurrentBooking = {
  arrived_at?: string | null;
  departed_at?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
};

function devLog(requestId: string, message: string, details?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[ops-status:update:${requestId}] ${message}`, details ?? {});
  }
}

function elapsed(start: number, last: number) {
  const now = Date.now();
  return { stepMs: now - last, totalMs: now - start, now };
}

function buildUpdates(action: OpsAction, now: string, current: CurrentBooking, userId: string) {
  const updates: Record<string, unknown> = {
    gate_status: action,
    updated_at: now,
  };

  switch (action) {
    case 'reserved':
      updates.gate_status = 'reserved';
      updates.status = 'reserved';
      updates.arrived_at = null;
      updates.departed_at = null;
      updates.checked_in_at = null;
      updates.checked_out_at = null;
      updates.highlight_code = 'none';
      updates.anpr_status = 'not_arrived';
      updates.ops_hidden = false;
      updates.ops_hidden_reason = null;
      updates.ops_hidden_at = null;
      updates.ops_hidden_by = null;
      break;
    case 'arrived':
      updates.gate_status = 'arrived';
      updates.arrived_at = current.arrived_at || now;
      updates.checked_in_at = current.checked_in_at || now;
      updates.checked_out_at = null;
      updates.status = 'checked_in';
      updates.highlight_code = 'none';
      updates.anpr_status = 'on_site';
      updates.ops_hidden = false;
      updates.ops_hidden_reason = null;
      updates.ops_hidden_at = null;
      updates.ops_hidden_by = null;
      break;
    case 'arrived_key_taken':
      updates.gate_status = 'arrived_key_taken';
      updates.arrived_at = current.arrived_at || now;
      updates.checked_in_at = current.checked_in_at || now;
      updates.checked_out_at = null;
      updates.status = 'checked_in';
      updates.highlight_code = 'key';
      updates.anpr_status = 'on_site';
      updates.ops_hidden = false;
      updates.ops_hidden_reason = null;
      updates.ops_hidden_at = null;
      updates.ops_hidden_by = null;
      break;
    case 'take_key':
      updates.gate_status = 'take_key';
      updates.highlight_code = 'key';
      break;
    case 'departed':
      updates.gate_status = 'departed';
      updates.departed_at = current.departed_at || now;
      updates.checked_out_at = current.checked_out_at || now;
      updates.checked_in_at = current.checked_in_at || now;
      updates.status = 'checked_out';
      updates.anpr_status = 'departed';
      updates.ops_hidden = true;
      updates.ops_hidden_reason = 'departed';
      updates.ops_hidden_at = now;
      updates.ops_hidden_by = userId;
      break;
    case 'no_show':
      updates.gate_status = 'no_show';
      updates.highlight_code = 'none';
      updates.ops_hidden = false;
      updates.ops_hidden_reason = null;
      updates.ops_hidden_at = null;
      updates.ops_hidden_by = null;
      break;
    case 'cancelled':
      updates.gate_status = 'cancelled';
      updates.status = 'cancelled';
      updates.external_status = 'cancelled';
      updates.checked_in_at = null;
      updates.checked_out_at = null;
      updates.highlight_code = 'none';
      updates.ops_hidden = true;
      updates.ops_hidden_reason = 'cancelled';
      updates.ops_hidden_at = now;
      updates.ops_hidden_by = userId;
      break;
  }

  return updates;
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();
  let last = started;

  try {
    devLog(requestId, 'start');
    const { bookingId, action } = bodySchema.parse(await req.json());

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
    }
    let timing = elapsed(started, last);
    last = timing.now;
    devLog(requestId, 'auth complete', { stepMs: timing.stepMs, totalMs: timing.totalMs });

    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('id, tenant_id, reference, arrived_at, departed_at, checked_in_at, checked_out_at')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }
    timing = elapsed(started, last);
    last = timing.now;
    devLog(requestId, 'booking loaded', { stepMs: timing.stepMs, totalMs: timing.totalMs });

    const { data: membership, error: membershipError } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', booking.tenant_id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const updates = buildUpdates(action, now, booking, user.id);
    const { data: updated, error: updateError } = await adminClient
      .from('bookings')
      .update(updates)
      .eq('id', bookingId)
      .eq('tenant_id', booking.tenant_id)
      .select('id, reference, status, gate_status, checked_in_at, checked_out_at, arrived_at, departed_at, anpr_status, highlight_code, ops_hidden, ops_hidden_reason, updated_at, external_status')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    timing = elapsed(started, last);
    last = timing.now;
    devLog(requestId, 'booking updated', { stepMs: timing.stepMs, totalMs: timing.totalMs });

    const { error: auditError } = await adminClient
      .from('audit_logs')
      .insert({
        actor_user_id: user.id,
        action: 'booking_ops_status_updated',
        target: {
          tenantId: booking.tenant_id,
          bookingId,
          reference: booking.reference,
          opsAction: action,
          gateStatus: updated.gate_status,
          status: updated.status,
        },
        created_at: now,
      });
    timing = elapsed(started, last);
    last = timing.now;
    devLog(requestId, 'audit logged', { stepMs: timing.stepMs, totalMs: timing.totalMs, ok: !auditError });
    if (auditError) {
      console.error(`[ops-status:update:${requestId}] audit failed`, auditError);
    }

    devLog(requestId, 'complete', { totalMs: Date.now() - started });
    return NextResponse.json({ booking: updated });
  } catch (err: any) {
    console.error(`[ops-status:update:${requestId}] failed`, err);
    return NextResponse.json({ error: err?.message ?? 'Unknown error' }, { status: 400 });
  }
}
