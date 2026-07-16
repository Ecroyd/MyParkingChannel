/**
 * Idempotent correction for bookings that have a departure timestamp but
 * stale on-site state fields. Preserves arrival/departure timestamps.
 * Does not append occupancy ledger events (state-only sync).
 */
import { createAdminClient } from '@/lib/supabase/admin';
import {
  effectiveDepartureAt,
  isCurrentlyParked,
  type OpsBookingState,
} from '@/lib/ops/parkedState';

export type DepartedStateCorrectionBooking = OpsBookingState & {
  id: string;
  tenant_id: string;
  reference?: string | null;
  plate?: string | null;
  customer_name?: string | null;
};

export type DepartedStatePatch = {
  status: 'checked_out';
  gate_status: 'departed';
  anpr_status: 'departed';
  ops_hidden: true;
  ops_hidden_reason: 'departed';
  ops_hidden_at: string;
  ops_hidden_by: string | null;
  checked_out_at: string;
  updated_at: string;
};

function lower(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

/** True when effective departure is set but status/gate/anpr/ops_hidden are inconsistent. */
export function needsDepartedStateConsistencyCorrection(b: OpsBookingState): boolean {
  if (!effectiveDepartureAt(b)) return false;
  const statusOk = lower(b.status) === 'checked_out';
  const gateOk = lower(b.gate_status) === 'departed';
  const anprOk = lower(b.anpr_status) === 'departed';
  const hiddenOk = Boolean(b.ops_hidden) && lower(b.ops_hidden_reason) === 'departed';
  return !(statusOk && gateOk && anprOk && hiddenOk);
}

/**
 * Build the state patch. Arrival and departed_at are never included.
 * checked_out_at is filled from existing effective departure when missing.
 */
export function buildDepartedStateConsistencyPatch(
  b: OpsBookingState,
  nowIso: string,
  actorUserId?: string | null
): DepartedStatePatch {
  const departure = effectiveDepartureAt(b);
  if (!departure) {
    throw new Error('Cannot build departed state correction without a departure timestamp');
  }
  const alreadyHidden =
    Boolean(b.ops_hidden) && lower(b.ops_hidden_reason) === 'departed' && Boolean(b.ops_hidden_at);

  return {
    status: 'checked_out',
    gate_status: 'departed',
    anpr_status: 'departed',
    ops_hidden: true,
    ops_hidden_reason: 'departed',
    ops_hidden_at: alreadyHidden && b.ops_hidden_at ? b.ops_hidden_at : nowIso,
    ops_hidden_by: alreadyHidden && b.ops_hidden_by != null ? b.ops_hidden_by : actorUserId ?? null,
    checked_out_at: b.checked_out_at || departure,
    updated_at: nowIso,
  };
}

export type ApplyDepartedStateCorrectionResult = {
  bookingId: string;
  corrected: boolean;
  idempotent: boolean;
  occupancyEventAppended: false;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

/**
 * Apply an audited state consistency correction.
 * Idempotent: no-op when already consistent. Never appends occupancy events.
 */
export async function applyDepartedStateConsistencyCorrection(opts: {
  bookingId: string;
  actorUserId?: string | null;
}): Promise<ApplyDepartedStateCorrectionResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const { data: booking, error } = await admin
    .from('bookings')
    .select(
      'id, tenant_id, reference, plate, customer_name, status, ops_status, gate_status, anpr_status, ops_hidden, ops_hidden_reason, ops_hidden_at, ops_hidden_by, arrived_at, departed_at, checked_in_at, checked_out_at'
    )
    .eq('id', opts.bookingId)
    .single();

  if (error || !booking) {
    throw new Error(error?.message ?? 'Booking not found');
  }

  const before = {
    status: booking.status,
    gate_status: booking.gate_status,
    anpr_status: booking.anpr_status,
    ops_hidden: booking.ops_hidden,
    ops_hidden_reason: booking.ops_hidden_reason,
    arrived_at: booking.arrived_at,
    departed_at: booking.departed_at,
    checked_in_at: booking.checked_in_at,
    checked_out_at: booking.checked_out_at,
  };

  if (!needsDepartedStateConsistencyCorrection(booking)) {
    return {
      bookingId: booking.id,
      corrected: false,
      idempotent: true,
      occupancyEventAppended: false,
      before,
      after: before,
    };
  }

  // If a departure ledger event already exists, we still only patch state —
  // never append another departure event from this path.
  const { data: existingDeparture } = await admin
    .from('booking_occupancy_events')
    .select('id')
    .eq('tenant_id', booking.tenant_id)
    .eq('booking_id', booking.id)
    .eq('event_kind', 'departure')
    .is('voided_at', null)
    .limit(1)
    .maybeSingle();

  const patch = buildDepartedStateConsistencyPatch(booking, nowIso, opts.actorUserId);

  const { data: updated, error: updateError } = await admin
    .from('bookings')
    .update(patch)
    .eq('id', booking.id)
    .eq('tenant_id', booking.tenant_id)
    .select(
      'status, gate_status, anpr_status, ops_hidden, ops_hidden_reason, arrived_at, departed_at, checked_in_at, checked_out_at'
    )
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message ?? 'Failed to apply state consistency correction');
  }

  await admin.from('audit_logs').insert({
    tenant_id: booking.tenant_id,
    actor_user_id: opts.actorUserId ?? null,
    action: 'booking_state_consistency_correction',
    entity: 'booking',
    entity_id: booking.id,
    metadata: {
      reason: 'state_consistency_correction',
      reference: booking.reference,
      plate: booking.plate,
      customer_name: booking.customer_name,
      before,
      after: updated,
      preservedTimestamps: {
        arrived_at: booking.arrived_at,
        departed_at: booking.departed_at,
        checked_in_at: booking.checked_in_at,
      },
      occupancyEventAppended: false,
      existingDepartureEventId: existingDeparture?.id ?? null,
      note: 'Corrected stale on-site state fields without changing arrival/departure timestamps or appending occupancy events.',
    },
    created_at: nowIso,
  });

  return {
    bookingId: booking.id,
    corrected: true,
    idempotent: false,
    occupancyEventAppended: false,
    before,
    after: updated,
  };
}

/** Booking 41140 / Foard — known stale departed-but-on-site case. */
export const FLY_PARKS_STALE_DEPARTED_BOOKING_ID = '47ca514f-ed3e-46f7-9a7e-df40aa841127';

export function booking41140ParkedAfterCorrectionFixture(): OpsBookingState {
  return {
    status: 'checked_out',
    ops_status: 'reserved',
    gate_status: 'departed',
    anpr_status: 'departed',
    ops_hidden: true,
    ops_hidden_reason: 'departed',
    arrived_at: '2026-07-02T09:46:06.188Z',
    checked_in_at: '2026-07-02T09:46:06.188Z',
    departed_at: '2026-07-16T13:27:22.271Z',
    checked_out_at: '2026-07-16T13:27:22.271Z',
  };
}

export function booking41140StaleOnSiteFixture(): OpsBookingState {
  return {
    status: 'checked_in',
    ops_status: 'reserved',
    gate_status: 'arrived_key_taken',
    anpr_status: 'on_site',
    ops_hidden: false,
    arrived_at: '2026-07-02T09:46:06.188Z',
    checked_in_at: '2026-07-02T09:46:06.188Z',
    departed_at: '2026-07-16T13:27:22.271Z',
    checked_out_at: null,
  };
}

export { isCurrentlyParked };
