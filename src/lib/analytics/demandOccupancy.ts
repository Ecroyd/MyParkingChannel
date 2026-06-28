/**
 * Shared booked demand and actual occupancy for demand curve + dynamic pricing.
 *
 * Booked demand = spaces sold/committed per tenant-local day.
 * Does NOT filter ops_hidden, departed, or no_show.
 */
import { zonedTimeToUtc } from 'date-fns-tz';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_TENANT_TIMEZONE, tenantDateKeyFromUtc } from '@/lib/datetime/parse';
import { GATE_STATUS } from '@/lib/gateStatus';

export type DemandBookingRow = {
  reference?: string | null;
  start_at: string;
  end_at: string;
  status?: string | null;
  gate_status?: string | null;
  ops_hidden?: boolean | null;
  source?: string | null;
};

export type DemandDayMetrics = {
  date: string;
  bookedDemand: number;
  actualOccupancy: number;
  arrivals: number;
  departures: number;
  capacity: number | null;
  occupancyPercent: number | null;
  bySource: Record<string, number>;
  countedRefs?: string[];
  excludedCancelledRefs?: string[];
  excludedNoShowRefs?: string[];
};

export function isCancelledForDemand(booking: DemandBookingRow): boolean {
  const status = (booking.status ?? '').toLowerCase();
  const gate = (booking.gate_status ?? '').toLowerCase();
  return status === 'cancelled' || gate === GATE_STATUS.CANCELLED;
}

export function isNoShowForDemand(booking: DemandBookingRow): boolean {
  return (booking.gate_status ?? '').toLowerCase() === GATE_STATUS.NO_SHOW;
}

export function countsForBookedDemand(booking: DemandBookingRow): boolean {
  return !isCancelledForDemand(booking);
}

export function countsForActualOccupancy(booking: DemandBookingRow): boolean {
  return !isCancelledForDemand(booking) && !isNoShowForDemand(booking);
}

/** Inclusive tenant-local calendar overlap: local_start_day <= day <= local_end_day */
export function bookingOverlapsTenantDay(
  booking: DemandBookingRow,
  dayKey: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): boolean {
  const startDay = tenantDateKeyFromUtc(booking.start_at, timezone);
  const endDay = tenantDateKeyFromUtc(booking.end_at, timezone);
  if (!startDay || !endDay) return false;
  return startDay <= dayKey && endDay >= dayKey;
}

export function tenantArrivalDay(
  booking: DemandBookingRow,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): string {
  return tenantDateKeyFromUtc(booking.start_at, timezone);
}

export function tenantDepartureDay(
  booking: DemandBookingRow,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): string {
  return tenantDateKeyFromUtc(booking.end_at, timezone);
}

export function enumerateDateKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime()) || cursor > end) {
    return keys;
  }
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function tenantDayUtcBounds(dateKey: string, timezone: string = DEFAULT_TENANT_TIMEZONE) {
  const dayStart = zonedTimeToUtc(`${dateKey}T00:00:00`, timezone);
  const dayEnd = zonedTimeToUtc(`${dateKey}T23:59:59.999`, timezone);
  return { dayStart, dayEnd };
}

export function queryWindowForTenantDays(
  from: string,
  to: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE
) {
  const { dayStart } = tenantDayUtcBounds(from, timezone);
  const { dayEnd } = tenantDayUtcBounds(to, timezone);
  return {
    windowStart: dayStart.toISOString(),
    windowEnd: dayEnd.toISOString(),
  };
}

export function defaultSourceKey(source: string | null | undefined): string {
  return (source ?? 'other').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'other';
}

export function aggregateDemandByDay(opts: {
  bookings: DemandBookingRow[];
  dayKeys: string[];
  timezone?: string;
  capacityByDate?: Record<string, number | null>;
  includeDebug?: boolean;
  keyFromSource?: (source: string | null | undefined) => string;
}): DemandDayMetrics[] {
  const timezone = opts.timezone ?? DEFAULT_TENANT_TIMEZONE;
  const keyFromSource = opts.keyFromSource ?? defaultSourceKey;
  const capacityByDate = opts.capacityByDate ?? {};

  return opts.dayKeys.map((date) => {
    const bySource: Record<string, number> = {};
    let bookedDemand = 0;
    let actualOccupancy = 0;
    let arrivals = 0;
    let departures = 0;
    const countedRefs: string[] = [];
    const excludedCancelledRefs: string[] = [];
    const excludedNoShowRefs: string[] = [];

    for (const booking of opts.bookings) {
      if (!bookingOverlapsTenantDay(booking, date, timezone)) continue;

      const ref = booking.reference ?? booking.start_at;

      if (isCancelledForDemand(booking)) {
        if (opts.includeDebug) excludedCancelledRefs.push(ref);
        continue;
      }

      if (isNoShowForDemand(booking)) {
        if (opts.includeDebug) excludedNoShowRefs.push(ref);
      } else {
        actualOccupancy += 1;
      }

      bookedDemand += 1;
      if (opts.includeDebug) countedRefs.push(ref);

      const sourceKey = keyFromSource(booking.source);
      bySource[sourceKey] = (bySource[sourceKey] ?? 0) + 1;

      if (tenantArrivalDay(booking, timezone) === date) arrivals += 1;
      if (tenantDepartureDay(booking, timezone) === date) departures += 1;
    }

    const capacity = capacityByDate[date] ?? null;
    const occupancyPercent =
      capacity && capacity > 0 ? Math.round((bookedDemand / capacity) * 1000) / 10 : null;

    const row: DemandDayMetrics = {
      date,
      bookedDemand,
      actualOccupancy,
      arrivals,
      departures,
      capacity,
      occupancyPercent,
      bySource,
    };

    if (opts.includeDebug) {
      row.countedRefs = countedRefs;
      row.excludedCancelledRefs = excludedCancelledRefs;
      row.excludedNoShowRefs = excludedNoShowRefs;
    }

    return row;
  });
}

export function maxBookedDemandOccupancyPercent(
  days: DemandDayMetrics[]
): number {
  let max = 0;
  for (const day of days) {
    if (day.capacity && day.capacity > 0) {
      max = Math.max(max, (day.bookedDemand / day.capacity) * 100);
    }
  }
  return Math.min(100, max);
}

const DEMAND_BOOKING_SELECT =
  'reference, start_at, end_at, status, gate_status, ops_hidden, source';

export async function loadDemandBookingsForWindow(opts: {
  tenantId: string;
  from: string;
  to: string;
  timezone?: string;
  excludeBookingReference?: string | null;
}): Promise<DemandBookingRow[]> {
  const timezone = opts.timezone ?? DEFAULT_TENANT_TIMEZONE;
  const supabase = createAdminClient();
  const { windowStart, windowEnd } = queryWindowForTenantDays(opts.from, opts.to, timezone);

  let query = supabase
    .from('bookings')
    .select(DEMAND_BOOKING_SELECT)
    .eq('tenant_id', opts.tenantId)
    .lt('start_at', windowEnd)
    .gt('end_at', windowStart);

  if (opts.excludeBookingReference) {
    query = query.neq('reference', opts.excludeBookingReference);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as DemandBookingRow[];
}

export async function computeDemandMetricsForWindow(opts: {
  tenantId: string;
  from: string;
  to: string;
  timezone?: string;
  capacityByDate?: Record<string, number | null>;
  includeDebug?: boolean;
  excludeBookingReference?: string | null;
}): Promise<DemandDayMetrics[]> {
  const timezone = opts.timezone ?? DEFAULT_TENANT_TIMEZONE;
  const dayKeys = enumerateDateKeys(opts.from, opts.to);
  const bookings = await loadDemandBookingsForWindow({
    tenantId: opts.tenantId,
    from: opts.from,
    to: opts.to,
    timezone,
    excludeBookingReference: opts.excludeBookingReference,
  });

  return aggregateDemandByDay({
    bookings,
    dayKeys,
    timezone,
    capacityByDate: opts.capacityByDate,
    includeDebug: opts.includeDebug,
  });
}
