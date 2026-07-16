/**
 * Occupancy timeseries and current-occupancy resolver.
 *
 * Expected: scheduled booking intervals (start_at / end_at).
 * Actual: vehicles parked according to the app — same rules as Currently Parked.
 *   Open stays use isAuthoritativeOnSite; departed stays occupy [arrival, departure).
 * Future slots leave Actual null.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_TENANT_TIMEZONE, tenantDateKeyFromUtc } from '@/lib/datetime/parse';
import { GATE_STATUS } from '@/lib/gateStatus';
import { isCancelledSupplierStatus } from '@/lib/ingest/importStatusMapping';
import { tenantDateRangeUtcBounds } from '@/lib/timezone';

export const OCCUPANCY_INTERVAL_MINUTES = 30;

export type OccupancyBookingRow = {
  id?: string;
  reference?: string | null;
  start_at: string;
  end_at: string;
  status?: string | null;
  gate_status?: string | null;
  ops_status?: string | null;
  anpr_status?: string | null;
  ops_hidden?: boolean | null;
  ops_hidden_reason?: string | null;
  external_status?: string | null;
  arrived_at?: string | null;
  departed_at?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
};

export type OccupancyEventRow = {
  id: string;
  tenant_id: string;
  booking_id: string;
  event_at: string;
  event_kind: 'arrival' | 'departure' | 'void';
  delta: number;
  voided_at?: string | null;
  operation_id?: string | null;
  voids_event_id?: string | null;
};

export type OccupancySnapshotRow = {
  tenant_id: string;
  snapshot_at: string;
  occupied_count: number;
  source: string;
  data_quality: string;
  metadata?: Record<string, unknown>;
};

export type OccupancyPoint = {
  timestamp: string;
  expected: number;
  actual: number | null;
  capacity: number | null;
};

export type OccupancyDataQuality = {
  missingArrivalDespiteOnSite: number;
  openButCancelledOrNoShow: number;
  departureBeforeArrival: number;
  keyRequiredNotArrived: number;
  departedButMarkedOnSite: number;
  duplicateActiveArrivalEvents: number;
  negativeOccupancyDetected: boolean;
};

export type OccupancyTimeseriesResult = {
  intervalMinutes: number;
  timezone: string;
  from: string;
  to: string;
  points: OccupancyPoint[];
  dataQuality: OccupancyDataQuality;
  reliableFrom: string | null;
  baselineAt: string | null;
  actualUnavailableBeforeBaseline: boolean;
};

export type CurrentOccupancyResult = {
  occupiedCount: number;
  mode: 'event_ledger' | 'fallback_booking_state';
  reliableFrom: string | null;
  negativeOccupancyDetected: boolean;
  dataQuality: OccupancyDataQuality;
};

function lower(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

export function isCancelledForExpectedOccupancy(booking: OccupancyBookingRow): boolean {
  if (['cancelled', 'canceled'].includes(lower(booking.status))) return true;
  if (['cancelled', 'canceled'].includes(lower(booking.gate_status))) return true;
  if (['cancelled', 'canceled'].includes(lower(booking.ops_status))) return true;
  if (isCancelledSupplierStatus(booking.external_status)) return true;
  return false;
}

export function isNoShowForExpectedOccupancy(booking: OccupancyBookingRow): boolean {
  const gate = lower(booking.gate_status);
  const ops = lower(booking.ops_status);
  return gate === GATE_STATUS.NO_SHOW || gate === 'no-show' || ops === 'no_show' || ops === 'no-show';
}

export function isOpsHiddenForExpectedOccupancy(booking: OccupancyBookingRow): boolean {
  if (!booking.ops_hidden) return false;
  return lower(booking.ops_hidden_reason) !== 'departed';
}

export function bookingIsIncludedInExpectedOccupancy(booking: OccupancyBookingRow): boolean {
  if (isCancelledForExpectedOccupancy(booking)) return false;
  if (isNoShowForExpectedOccupancy(booking)) return false;
  if (isOpsHiddenForExpectedOccupancy(booking)) return false;
  return true;
}

export function effectiveArrivalAt(booking: OccupancyBookingRow): string | null {
  return booking.arrived_at || booking.checked_in_at || null;
}

export function effectiveDepartureAt(booking: OccupancyBookingRow): string | null {
  return booking.departed_at || booking.checked_out_at || null;
}

/** Physical on-site state indicators — take_key is never physical occupancy. */
export function indicatesPhysicalOnSiteState(booking: OccupancyBookingRow): boolean {
  const gate = lower(booking.gate_status);
  if (gate === GATE_STATUS.TAKE_KEY) return false;
  if (gate === GATE_STATUS.ARRIVED || gate === GATE_STATUS.ARRIVED_KEY_TAKEN) return true;
  if (lower(booking.anpr_status) === 'on_site') return true;
  if (lower(booking.status) === 'checked_in') return true;
  return false;
}

/**
 * Authoritative physical occupancy (Currently Parked / Actual Now / baseline).
 *
 * Counts only when:
 * - effective arrival is set
 * - effective departure is null
 * - not ops_hidden
 * - not cancelled / no-show / CANX
 * - physical state indicates on-site (arrived, arrived_key_taken, anpr on_site, or checked_in)
 * - gate_status take_key never counts
 */
export function isAuthoritativeOnSite(booking: OccupancyBookingRow): boolean {
  if (isCancelledForExpectedOccupancy(booking)) return false;
  if (isNoShowForExpectedOccupancy(booking)) return false;
  if (booking.ops_hidden) return false;
  if (lower(booking.gate_status) === GATE_STATUS.TAKE_KEY) return false;
  if (lower(booking.gate_status) === GATE_STATUS.DEPARTED) return false;
  if (!effectiveArrivalAt(booking)) return false;
  if (effectiveDepartureAt(booking)) return false;
  return indicatesPhysicalOnSiteState(booking);
}

/** take_key without arrival — key workflow, not parked. */
export function isKeyRequiredNotArrived(booking: OccupancyBookingRow): boolean {
  if (lower(booking.gate_status) !== GATE_STATUS.TAKE_KEY) return false;
  return !effectiveArrivalAt(booking);
}

/** Departure timestamp exists but state fields still say on-site. */
export function isDepartedButMarkedOnSite(booking: OccupancyBookingRow): boolean {
  if (!effectiveDepartureAt(booking)) return false;
  if (isCancelledForExpectedOccupancy(booking) || isNoShowForExpectedOccupancy(booking)) return false;
  return indicatesPhysicalOnSiteState(booking);
}

/** Arrived/arrived_key_taken (or anpr/status on-site) without an arrival timestamp. */
export function isMissingArrivalDespiteOnSite(booking: OccupancyBookingRow): boolean {
  if (isCancelledForExpectedOccupancy(booking) || isNoShowForExpectedOccupancy(booking)) return false;
  if (lower(booking.gate_status) === GATE_STATUS.TAKE_KEY) return false;
  if (!indicatesPhysicalOnSiteState(booking)) return false;
  return !effectiveArrivalAt(booking);
}

export function isOpenButCancelledOrNoShow(booking: OccupancyBookingRow): boolean {
  const openTs = Boolean(effectiveArrivalAt(booking)) && !effectiveDepartureAt(booking);
  const openState = indicatesPhysicalOnSiteState(booking);
  if (!openTs && !openState) return false;
  return isCancelledForExpectedOccupancy(booking) || isNoShowForExpectedOccupancy(booking);
}

export function hasDepartureBeforeArrival(booking: OccupancyBookingRow): boolean {
  const arrival = booking.arrived_at || booking.checked_in_at;
  const departure = booking.departed_at || booking.checked_out_at;
  if (!arrival || !departure) return false;
  return new Date(departure).getTime() < new Date(arrival).getTime();
}

export function assessBookingDataQuality(bookings: OccupancyBookingRow[]): OccupancyDataQuality {
  let missingArrivalDespiteOnSite = 0;
  let openButCancelledOrNoShow = 0;
  let departureBeforeArrival = 0;
  let keyRequiredNotArrived = 0;
  let departedButMarkedOnSite = 0;
  for (const b of bookings) {
    if (isMissingArrivalDespiteOnSite(b)) missingArrivalDespiteOnSite += 1;
    if (isOpenButCancelledOrNoShow(b)) openButCancelledOrNoShow += 1;
    if (hasDepartureBeforeArrival(b)) departureBeforeArrival += 1;
    if (isKeyRequiredNotArrived(b)) keyRequiredNotArrived += 1;
    if (isDepartedButMarkedOnSite(b)) departedButMarkedOnSite += 1;
  }
  return {
    missingArrivalDespiteOnSite,
    openButCancelledOrNoShow,
    departureBeforeArrival,
    keyRequiredNotArrived,
    departedButMarkedOnSite,
    duplicateActiveArrivalEvents: 0,
    negativeOccupancyDetected: false,
  };
}

export function generateOccupancySlots(
  fromIso: string,
  toIso: string,
  intervalMinutes: number = OCCUPANCY_INTERVAL_MINUTES
): string[] {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const step = intervalMinutes * 60_000;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || step <= 0 || fromMs >= toMs) {
    return [];
  }
  const slots: string[] = [];
  for (let t = fromMs; t < toMs; t += step) {
    slots.push(new Date(t).toISOString());
  }
  return slots;
}

export function occupancyWindowFromDateKeys(fromDate: string, toDate: string) {
  const { rangeStart } = tenantDateRangeUtcBounds(fromDate, toDate);
  const endExclusive = new Date(`${toDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { from: rangeStart, to: endExclusive.toISOString() };
}

export function expectedOccupiesSlot(booking: OccupancyBookingRow, slotIso: string): boolean {
  if (!bookingIsIncludedInExpectedOccupancy(booking)) return false;
  const slot = new Date(slotIso).getTime();
  return new Date(booking.start_at).getTime() <= slot && new Date(booking.end_at).getTime() > slot;
}

/** Active (non-voided) movement events only. */
export function activeOccupancyEvents(events: OccupancyEventRow[]): OccupancyEventRow[] {
  return events.filter(
    (e) => !e.voided_at && (e.event_kind === 'arrival' || e.event_kind === 'departure')
  );
}

/**
 * Whether a booking contributes to Actual occupancy at a slot.
 * Matches Currently Parked for open stays; uses arrival→departure for completed stays.
 */
export function actualOccupiesSlot(
  booking: OccupancyBookingRow,
  slotIso: string,
  nowMs: number
): boolean {
  const slotMs = new Date(slotIso).getTime();
  if (!Number.isFinite(slotMs) || slotMs > nowMs) return false;
  if (isCancelledForExpectedOccupancy(booking) || isNoShowForExpectedOccupancy(booking)) {
    return false;
  }
  if (lower(booking.gate_status) === GATE_STATUS.TAKE_KEY && !effectiveArrivalAt(booking)) {
    return false;
  }

  const arrival = effectiveArrivalAt(booking);
  if (!arrival) return false;
  if (new Date(arrival).getTime() > slotMs) return false;

  const departure = effectiveDepartureAt(booking);
  if (departure && new Date(departure).getTime() <= slotMs) return false;

  // Still on site (no departure timestamp): same rules as Currently Parked.
  if (!departure) {
    return isAuthoritativeOnSite(booking);
  }

  // Completed stay: count only during [arrival, departure).
  return true;
}

/**
 * Actual vehicles parked at a slot — app booking state, not a baseline ledger.
 * Future slots return null.
 */
export function actualOccupancyAt(opts: {
  slotIso: string;
  nowMs: number;
  bookings: OccupancyBookingRow[];
  /** @deprecated Ignored — Actual uses booking parked state. */
  reliableFrom?: string | null;
  /** @deprecated Ignored — Actual uses booking parked state. */
  snapshots?: OccupancySnapshotRow[];
  /** @deprecated Ignored — Actual uses booking parked state. */
  events?: OccupancyEventRow[];
}): { count: number | null; negative: boolean } {
  const slotMs = new Date(opts.slotIso).getTime();
  if (slotMs > opts.nowMs) return { count: null, negative: false };

  let count = 0;
  for (const booking of opts.bookings) {
    if (actualOccupiesSlot(booking, opts.slotIso, opts.nowMs)) count += 1;
  }
  return { count, negative: false };
}

/**
 * Optional ledger balance (baseline + events). Kept for ops tooling / tests.
 * Not used for the chart Actual line.
 */
export function actualOccupancyFromLedgerAt(opts: {
  slotIso: string;
  nowMs: number;
  reliableFrom: string | null;
  snapshots: OccupancySnapshotRow[];
  events: OccupancyEventRow[];
}): { count: number | null; negative: boolean } {
  const slotMs = new Date(opts.slotIso).getTime();
  if (slotMs > opts.nowMs) return { count: null, negative: false };
  if (!opts.reliableFrom) return { count: null, negative: false };
  if (slotMs < new Date(opts.reliableFrom).getTime()) return { count: null, negative: false };

  const snapshot = [...opts.snapshots]
    .filter((s) => new Date(s.snapshot_at).getTime() <= slotMs)
    .sort((a, b) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime())[0];

  if (!snapshot) return { count: null, negative: false };

  const baseAt = new Date(snapshot.snapshot_at).getTime();
  let sum = 0;
  for (const event of activeOccupancyEvents(opts.events)) {
    const at = new Date(event.event_at).getTime();
    if (at > baseAt && at <= slotMs) sum += event.delta;
  }
  const raw = snapshot.occupied_count + sum;
  if (raw < 0) return { count: 0, negative: true };
  return { count: raw, negative: false };
}

/**
 * Idempotent event application for tests / pure logic.
 * Duplicate arrival while on-site → ignored.
 * Duplicate departure while departed → ignored.
 * Same operation_id → ignored.
 */
export function applyOccupancyEventPure(
  state: {
    onSiteBookingIds: Set<string>;
    events: OccupancyEventRow[];
    occupied: number;
  },
  event: Omit<OccupancyEventRow, 'id'> & { id?: string }
): { state: typeof state; applied: boolean; reason?: string } {
  if (event.operation_id) {
    const dup = state.events.find(
      (e) =>
        e.operation_id === event.operation_id &&
        e.booking_id === event.booking_id &&
        e.event_kind === event.event_kind &&
        !e.voided_at
    );
    if (dup) {
      return { state, applied: false, reason: 'duplicate_operation_id' };
    }
  }

  if (event.event_kind === 'arrival') {
    if (state.onSiteBookingIds.has(event.booking_id)) {
      return { state, applied: false, reason: 'already_on_site' };
    }
    const next = {
      onSiteBookingIds: new Set(state.onSiteBookingIds),
      events: [...state.events],
      occupied: state.occupied + 1,
    };
    next.onSiteBookingIds.add(event.booking_id);
    next.events.push({ ...event, id: event.id ?? crypto.randomUUID(), delta: 1 } as OccupancyEventRow);
    return { state: next, applied: true };
  }

  if (event.event_kind === 'departure') {
    if (!state.onSiteBookingIds.has(event.booking_id)) {
      return { state, applied: false, reason: 'not_on_site' };
    }
    const next = {
      onSiteBookingIds: new Set(state.onSiteBookingIds),
      events: [...state.events],
      occupied: state.occupied - 1,
    };
    next.onSiteBookingIds.delete(event.booking_id);
    next.events.push({ ...event, id: event.id ?? crypto.randomUUID(), delta: -1 } as OccupancyEventRow);
    return { state: next, applied: true };
  }

  if (event.event_kind === 'void' && event.voids_event_id) {
    // Pure helper: void referenced event and apply opposite delta once
    const target = state.events.find((e) => e.id === event.voids_event_id && !e.voided_at);
    if (!target) return { state, applied: false, reason: 'void_target_missing' };
    const nextEvents = state.events.map((e) =>
      e.id === target.id ? { ...e, voided_at: event.event_at } : e
    );
    nextEvents.push({
      ...event,
      id: event.id ?? crypto.randomUUID(),
      delta: -target.delta,
    } as OccupancyEventRow);
    const onSite = new Set(state.onSiteBookingIds);
    let occupied = state.occupied - target.delta;
    if (target.event_kind === 'arrival') onSite.delete(target.booking_id);
    if (target.event_kind === 'departure') onSite.add(target.booking_id);
    return {
      state: { onSiteBookingIds: onSite, events: nextEvents, occupied },
      applied: true,
    };
  }

  return { state, applied: false, reason: 'unsupported' };
}

export function aggregateOccupancyTimeseries(opts: {
  bookings: OccupancyBookingRow[];
  snapshots: OccupancySnapshotRow[];
  events: OccupancyEventRow[];
  from: string;
  to: string;
  intervalMinutes?: number;
  capacityByDate?: Record<string, number | null>;
  timezone?: string;
  reliableFrom?: string | null;
  now?: Date;
}): OccupancyTimeseriesResult {
  const intervalMinutes = opts.intervalMinutes ?? OCCUPANCY_INTERVAL_MINUTES;
  const timezone = opts.timezone ?? DEFAULT_TENANT_TIMEZONE;
  const nowMs = (opts.now ?? new Date()).getTime();
  const reliableFrom = opts.reliableFrom ?? null;
  const slots = generateOccupancySlots(opts.from, opts.to, intervalMinutes);
  const capacityByDate = opts.capacityByDate ?? {};
  const dataQuality = assessBookingDataQuality(opts.bookings);
  let negative = false;

  const points: OccupancyPoint[] = slots.map((slotIso) => {
    let expected = 0;
    for (const booking of opts.bookings) {
      if (expectedOccupiesSlot(booking, slotIso)) expected += 1;
    }
    const actual = actualOccupancyAt({
      slotIso,
      nowMs,
      bookings: opts.bookings,
    });
    if (actual.negative) negative = true;
    const dayKey = tenantDateKeyFromUtc(slotIso, timezone);
    return {
      timestamp: slotIso,
      expected,
      actual: actual.count,
      capacity: dayKey ? capacityByDate[dayKey] ?? null : null,
    };
  });

  const baselineAt =
    [...opts.snapshots].sort(
      (a, b) => new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime()
    )[0]?.snapshot_at ?? null;

  return {
    intervalMinutes,
    timezone,
    from: opts.from,
    to: opts.to,
    points,
    dataQuality: { ...dataQuality, negativeOccupancyDetected: negative },
    reliableFrom,
    baselineAt,
    actualUnavailableBeforeBaseline: false,
  };
}

export function resolveCurrentOccupancyPure(opts: {
  bookings: OccupancyBookingRow[];
  snapshots: OccupancySnapshotRow[];
  events: OccupancyEventRow[];
  reliableFrom: string | null;
  now?: Date;
}): CurrentOccupancyResult {
  const dataQuality = assessBookingDataQuality(opts.bookings);
  const occupiedCount = opts.bookings.filter(isAuthoritativeOnSite).length;
  return {
    occupiedCount,
    mode: 'fallback_booking_state',
    reliableFrom: opts.reliableFrom,
    negativeOccupancyDetected: false,
    dataQuality,
  };
}

export async function resolveOccupancyCapacityByDate(
  tenantId: string,
  dates: string[]
): Promise<Record<string, number | null>> {
  const supabase = createAdminClient();
  const [{ data: capRows }, { data: tenant }, { data: settings }] = await Promise.all([
    supabase.from('tenant_capacity').select('date, capacity').eq('tenant_id', tenantId).in('date', dates),
    supabase.from('tenants').select('default_capacity').eq('id', tenantId).maybeSingle(),
    supabase
      .from('tenant_settings')
      .select('default_daily_capacity')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);

  const overrides: Record<string, number> = {};
  for (const row of capRows ?? []) overrides[row.date] = row.capacity;
  const fallback = tenant?.default_capacity ?? settings?.default_daily_capacity ?? null;
  const result: Record<string, number | null> = {};
  for (const date of dates) {
    result[date] = overrides[date] !== undefined ? overrides[date] : fallback;
  }
  return result;
}

export function enumerateLocalDateKeysFromWindow(
  fromIso: string,
  toIsoExclusive: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): string[] {
  const keys = new Set<string>();
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIsoExclusive).getTime();
  for (let t = fromMs; t < toMs; t += 60 * 60_000) {
    const key = tenantDateKeyFromUtc(new Date(t).toISOString(), timezone);
    if (key) keys.add(key);
  }
  const lastKey = tenantDateKeyFromUtc(new Date(Math.max(fromMs, toMs - 1)).toISOString(), timezone);
  if (lastKey) keys.add(lastKey);
  return Array.from(keys).sort();
}

const BOOKING_SELECT =
  'id, reference, start_at, end_at, status, gate_status, ops_status, anpr_status, ops_hidden, ops_hidden_reason, external_status, arrived_at, departed_at, checked_in_at, checked_out_at';

export async function loadOccupancyInputs(opts: {
  tenantId: string;
  from: string;
  to: string;
}): Promise<{
  bookings: OccupancyBookingRow[];
  events: OccupancyEventRow[];
  snapshots: OccupancySnapshotRow[];
  reliableFrom: string | null;
  timezone: string;
}> {
  const supabase = createAdminClient();

  const [bookingsRes, onSiteRes, eventsRes, snapshotsRes, settingsRes, tenantRes] = await Promise.all([
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('tenant_id', opts.tenantId)
      .lt('start_at', opts.to)
      .gt('end_at', opts.from),
    // Overstays / open parked stays may fall outside the schedule window
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('tenant_id', opts.tenantId)
      .or(
        'gate_status.in.(arrived,arrived_key_taken),anpr_status.eq.on_site,status.eq.checked_in'
      ),
    supabase
      .from('booking_occupancy_events')
      .select('id, tenant_id, booking_id, event_at, event_kind, delta, voided_at, operation_id')
      .eq('tenant_id', opts.tenantId)
      .lte('event_at', opts.to)
      .order('event_at', { ascending: true }),
    supabase
      .from('tenant_occupancy_snapshots')
      .select('tenant_id, snapshot_at, occupied_count, source, data_quality, metadata')
      .eq('tenant_id', opts.tenantId)
      .lte('snapshot_at', opts.to)
      .order('snapshot_at', { ascending: false }),
    supabase
      .from('tenant_settings')
      .select('occupancy_events_reliable_from')
      .eq('tenant_id', opts.tenantId)
      .maybeSingle(),
    supabase.from('tenants').select('timezone').eq('id', opts.tenantId).maybeSingle(),
  ]);

  // Events/snapshots tables may not exist yet — treat as empty
  const events = (eventsRes.error ? [] : eventsRes.data ?? []) as OccupancyEventRow[];
  const snapshots = (snapshotsRes.error ? [] : snapshotsRes.data ?? []) as OccupancySnapshotRow[];
  if (bookingsRes.error) throw bookingsRes.error;

  const byId = new Map<string, OccupancyBookingRow>();
  for (const row of [...(bookingsRes.data ?? []), ...(onSiteRes.data ?? [])] as OccupancyBookingRow[]) {
    if (row.id) byId.set(row.id, row);
    else byId.set(`${row.start_at}|${row.end_at}|${row.reference ?? ''}`, row);
  }

  return {
    bookings: Array.from(byId.values()),
    events,
    snapshots,
    reliableFrom: settingsRes.error
      ? null
      : settingsRes.data?.occupancy_events_reliable_from ?? null,
    timezone: tenantRes.data?.timezone || DEFAULT_TENANT_TIMEZONE,
  };
}

export async function computeOccupancyTimeseries(opts: {
  tenantId: string;
  fromDate: string;
  toDate: string;
  timezone?: string;
  intervalMinutes?: number;
  now?: Date;
}): Promise<OccupancyTimeseriesResult> {
  const { from, to } = occupancyWindowFromDateKeys(opts.fromDate, opts.toDate);
  const inputs = await loadOccupancyInputs({ tenantId: opts.tenantId, from, to });
  const timezone = opts.timezone ?? inputs.timezone;
  const dayKeys = enumerateLocalDateKeysFromWindow(from, to, timezone);
  const capacityByDate = await resolveOccupancyCapacityByDate(opts.tenantId, dayKeys);

  return aggregateOccupancyTimeseries({
    bookings: inputs.bookings,
    snapshots: inputs.snapshots,
    events: inputs.events,
    from,
    to,
    intervalMinutes: opts.intervalMinutes,
    capacityByDate,
    timezone,
    reliableFrom: inputs.reliableFrom,
    now: opts.now,
  });
}

export async function getCurrentOccupancy(tenantId: string): Promise<CurrentOccupancyResult> {
  const supabase = createAdminClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const inputs = await loadOccupancyInputs({
    tenantId,
    from: windowStart,
    to: new Date(now.getTime() + 86_400_000).toISOString(),
  });

  // Same candidate set as Currently Parked (take_key intentionally excluded via resolver)
  const { data: onSiteCandidates } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('tenant_id', tenantId)
    .or(
      'gate_status.in.(arrived,arrived_key_taken),anpr_status.eq.on_site,status.eq.checked_in'
    );

  return resolveCurrentOccupancyPure({
    bookings: (onSiteCandidates as OccupancyBookingRow[]) ?? inputs.bookings,
    snapshots: inputs.snapshots,
    events: inputs.events,
    reliableFrom: inputs.reliableFrom,
    now,
  });
}

export type OccupancySummary =
  | {
      mode: 'now';
      actualNow: number | null;
      expectedNow: number;
      variance: number | null;
      capacity: number | null;
    }
  | {
      mode: 'historical';
      peakActual: number | null;
      peakExpected: number;
      largestVariance: number | null;
    };

export function summarizeOccupancyPoints(
  points: OccupancyPoint[],
  now: Date = new Date()
): OccupancySummary | null {
  if (points.length === 0) return null;
  const nowMs = now.getTime();
  const rangeIncludesNow =
    new Date(points[0].timestamp).getTime() <= nowMs &&
    new Date(points[points.length - 1].timestamp).getTime() +
      OCCUPANCY_INTERVAL_MINUTES * 60_000 >
      nowMs;

  if (rangeIncludesNow) {
    let latestPast: OccupancyPoint | null = null;
    for (const point of points) {
      if (new Date(point.timestamp).getTime() <= nowMs) latestPast = point;
    }
    const point = latestPast ?? points[0];
    return {
      mode: 'now',
      actualNow: point.actual,
      expectedNow: point.expected,
      variance: point.actual == null ? null : point.actual - point.expected,
      capacity: point.capacity,
    };
  }

  let peakActual: number | null = null;
  let peakExpected = 0;
  let largestVariance: number | null = null;
  for (const point of points) {
    peakExpected = Math.max(peakExpected, point.expected);
    if (point.actual != null) {
      peakActual = Math.max(peakActual ?? 0, point.actual);
      const v = Math.abs(point.actual - point.expected);
      largestVariance = Math.max(largestVariance ?? 0, v);
    }
  }
  return { mode: 'historical', peakActual, peakExpected, largestVariance };
}
