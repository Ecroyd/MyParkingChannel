/**
 * Apply a booking operational action with an occupancy ledger event.
 * Prefers the atomic Postgres RPC; falls back to booking update + event insert.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import {
  applyArrivalTimestamps,
  applyDepartureTimestamps,
  clearPresenceTimestamps,
} from '@/lib/ops/presenceTimestamps';

export type OccupancyOpsAction =
  | 'reserved'
  | 'arrived'
  | 'arrived_key_taken'
  | 'take_key'
  | 'departed'
  | 'no_show'
  | 'cancelled';

export type ApplyOccupancyActionOpts = {
  bookingId: string;
  action: OccupancyOpsAction;
  actorUserId?: string | null;
  source?: 'manual' | 'bulk' | 'anpr' | 'qr' | 'api' | 'correction';
  operationId?: string | null;
  eventAt?: string;
  metadata?: Record<string, unknown>;
};

export type ApplyOccupancyActionResult = {
  booking: Record<string, unknown>;
  delta: number;
  eventId: string | null;
  idempotent: boolean;
  via: 'rpc' | 'fallback';
};

function buildBookingUpdates(
  action: OccupancyOpsAction,
  now: string,
  current: {
    arrived_at?: string | null;
    departed_at?: string | null;
    checked_in_at?: string | null;
    checked_out_at?: string | null;
    gate_status?: string | null;
  },
  userId: string
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    gate_status: action,
    updated_at: now,
  };

  switch (action) {
    case 'reserved':
      Object.assign(updates, clearPresenceTimestamps());
      updates.status = 'reserved';
      updates.highlight_code = 'none';
      updates.anpr_status = 'not_arrived';
      updates.ops_hidden = false;
      updates.ops_hidden_reason = null;
      updates.ops_hidden_at = null;
      updates.ops_hidden_by = null;
      break;
    case 'arrived':
      Object.assign(updates, applyArrivalTimestamps(current, now));
      updates.status = 'checked_in';
      updates.highlight_code = 'none';
      updates.anpr_status = 'on_site';
      updates.ops_hidden = false;
      updates.ops_hidden_reason = null;
      updates.ops_hidden_at = null;
      updates.ops_hidden_by = null;
      break;
    case 'arrived_key_taken':
      Object.assign(updates, applyArrivalTimestamps(current, now));
      updates.status = 'checked_in';
      updates.highlight_code = 'key';
      updates.anpr_status = 'on_site';
      updates.ops_hidden = false;
      updates.ops_hidden_reason = null;
      updates.ops_hidden_at = null;
      updates.ops_hidden_by = null;
      break;
    case 'take_key':
      updates.highlight_code = 'key';
      break;
    case 'departed':
      Object.assign(updates, applyDepartureTimestamps(current, now));
      updates.gate_status = 'departed';
      updates.status = 'checked_out';
      updates.anpr_status = 'departed';
      updates.ops_hidden = true;
      updates.ops_hidden_reason = 'departed';
      updates.ops_hidden_at = now;
      updates.ops_hidden_by = userId || null;
      break;
    case 'no_show':
      updates.highlight_code = 'none';
      updates.ops_hidden = false;
      updates.ops_hidden_reason = null;
      updates.ops_hidden_at = null;
      updates.ops_hidden_by = null;
      break;
    case 'cancelled':
      Object.assign(updates, clearPresenceTimestamps());
      updates.status = 'cancelled';
      updates.external_status = 'cancelled';
      updates.highlight_code = 'none';
      updates.ops_hidden = true;
      updates.ops_hidden_reason = 'cancelled';
      updates.ops_hidden_at = now;
      updates.ops_hidden_by = userId;
      break;
  }
  return updates;
}

function wasOnSite(gateStatus: string | null | undefined): boolean {
  const g = (gateStatus ?? '').toLowerCase();
  return g === 'arrived' || g === 'arrived_key_taken';
}

async function fallbackApply(opts: ApplyOccupancyActionOpts): Promise<ApplyOccupancyActionResult> {
  const admin = createAdminClient();
  const now = opts.eventAt ?? new Date().toISOString();
  const source = opts.source ?? 'manual';

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .select(
      'id, tenant_id, reference, arrived_at, departed_at, checked_in_at, checked_out_at, gate_status, status'
    )
    .eq('id', opts.bookingId)
    .single();

  if (bookingError || !booking) {
    throw new Error(bookingError?.message ?? 'Booking not found');
  }

  const onSiteBefore = wasOnSite(booking.gate_status);
  const alreadyDeparted = (booking.gate_status ?? '').toLowerCase() === 'departed';

  // operation_id idempotency
  if (opts.operationId && (opts.action === 'arrived' || opts.action === 'arrived_key_taken' || opts.action === 'departed')) {
    const kind = opts.action === 'departed' ? 'departure' : 'arrival';
    const { data: existing } = await admin
      .from('booking_occupancy_events')
      .select('id')
      .eq('tenant_id', booking.tenant_id)
      .eq('booking_id', booking.id)
      .eq('event_kind', kind)
      .eq('operation_id', opts.operationId)
      .maybeSingle();
    if (existing) {
      const { data: current } = await admin
        .from('bookings')
        .select('*')
        .eq('id', booking.id)
        .single();
      return {
        booking: current ?? booking,
        delta: 0,
        eventId: existing.id,
        idempotent: true,
        via: 'fallback',
      };
    }
  }

  const updates = buildBookingUpdates(opts.action, now, booking, opts.actorUserId ?? '');
  const { data: updated, error: updateError } = await admin
    .from('bookings')
    .update(updates)
    .eq('id', booking.id)
    .eq('tenant_id', booking.tenant_id)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? 'Failed to update booking');
  }

  let delta = 0;
  let eventId: string | null = null;
  const meta = { ...(opts.metadata ?? {}), action: opts.action };
  const actor = opts.actorUserId ?? null;

  const insertEvent = async (row: Record<string, unknown>) => {
    const { data, error } = await admin
      .from('booking_occupancy_events')
      .insert(row)
      .select('id')
      .single();
    if (error) {
      // Table may not exist yet — log and continue with booking update
      console.warn('[occupancy] event insert failed', error.message);
      return null;
    }
    return data?.id ?? null;
  };

  const voidLatestArrival = async (reason: string) => {
    const { data: prior } = await admin
      .from('booking_occupancy_events')
      .select('id')
      .eq('tenant_id', booking.tenant_id)
      .eq('booking_id', booking.id)
      .eq('event_kind', 'arrival')
      .is('voided_at', null)
      .order('event_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!prior) return;
    await admin
      .from('booking_occupancy_events')
      .update({ voided_at: now })
      .eq('id', prior.id);
    eventId = await insertEvent({
      tenant_id: booking.tenant_id,
      booking_id: booking.id,
      event_at: now,
      event_kind: 'void',
      delta: -1,
      source: source === 'manual' ? 'correction' : source,
      actor_user_id: actor,
      operation_id: opts.operationId ?? null,
      voids_event_id: prior.id,
      metadata: { ...meta, reason },
    });
    delta = -1;
  };

  let idempotent = false;

  if (opts.action === 'arrived' || opts.action === 'arrived_key_taken') {
    if (onSiteBefore) {
      idempotent = true;
    } else {
      eventId = await insertEvent({
        tenant_id: booking.tenant_id,
        booking_id: booking.id,
        event_at: now,
        event_kind: 'arrival',
        delta: 1,
        source,
        actor_user_id: actor,
        operation_id: opts.operationId ?? null,
        metadata: meta,
      });
      delta = 1;
    }
  } else if (opts.action === 'departed') {
    if (alreadyDeparted) {
      idempotent = true;
    } else {
      eventId = await insertEvent({
        tenant_id: booking.tenant_id,
        booking_id: booking.id,
        event_at: now,
        event_kind: 'departure',
        delta: -1,
        source,
        actor_user_id: actor,
        operation_id: opts.operationId ?? null,
        metadata: meta,
      });
      delta = -1;
    }
  } else if (opts.action === 'reserved' && onSiteBefore) {
    await voidLatestArrival('revert_arrival');
  } else if (opts.action === 'cancelled' && onSiteBefore) {
    await voidLatestArrival('cancelled_after_arrival');
  } else if (opts.action === 'no_show' && onSiteBefore) {
    await voidLatestArrival('no_show_after_arrival');
  }

  await admin.from('audit_logs').insert({
    tenant_id: booking.tenant_id,
    actor_user_id: actor,
    action: 'booking_ops_status_updated',
    entity: 'booking',
    entity_id: booking.id,
    metadata: {
      reference: booking.reference,
      opsAction: opts.action,
      source,
      operationId: opts.operationId,
      occupancyDelta: delta,
      eventId,
    },
    created_at: now,
  });

  return {
    booking: updated,
    delta,
    eventId,
    idempotent,
    via: 'fallback',
  };
}

export async function applyBookingOccupancyAction(
  opts: ApplyOccupancyActionOpts
): Promise<ApplyOccupancyActionResult> {
  const admin = createAdminClient();

  try {
    const { data, error } = await admin.rpc('apply_booking_occupancy_action', {
      p_booking_id: opts.bookingId,
      p_action: opts.action,
      p_actor_user_id: opts.actorUserId ?? null,
      p_source: opts.source ?? 'manual',
      p_operation_id: opts.operationId ?? null,
      p_event_at: opts.eventAt ?? new Date().toISOString(),
      p_metadata: opts.metadata ?? {},
    });

    if (!error && data) {
      const payload = data as {
        bookingId?: string;
        delta?: number;
        eventId?: string | null;
        idempotent?: boolean;
      };
      const { data: booking } = await admin
        .from('bookings')
        .select('*')
        .eq('id', opts.bookingId)
        .single();
      return {
        booking: booking ?? { id: opts.bookingId },
        delta: payload.delta ?? 0,
        eventId: payload.eventId ?? null,
        idempotent: Boolean(payload.idempotent),
        via: 'rpc',
      };
    }
  } catch (err) {
    console.warn('[occupancy] RPC apply failed, using fallback', err);
  }

  return fallbackApply(opts);
}
