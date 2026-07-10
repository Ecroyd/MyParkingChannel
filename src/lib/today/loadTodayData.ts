import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateCapacityForDate } from '@/lib/capacity/rolling';
import { getDateRangeForQuery, tenantTodayDateKey } from '@/lib/timezone';
import { TODAY_BOOKING_SELECT, type TodayBookingRow } from '@/lib/today/bookingSelect';
import {
  isCurrentlyParked,
  isExcludedFromOperations,
} from '@/lib/bookings/operational-state';

export type TodayKpis = {
  arrivals: number;
  departures: number;
  checkedIn: number;
  capacityLeft: number;
  totalRevenue: number;
};

export type TodayPageData = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    timezone: string | null;
    default_capacity: number | null;
  };
  kpis: TodayKpis;
  arrivals: TodayBookingRow[];
  departures: TodayBookingRow[];
  currentlyParked: TodayBookingRow[];
  rangeFrom: string;
  rangeTo: string;
  queryError?: string;
};

function isCancelledBooking(booking: { status?: string | null; gate_status?: string | null }) {
  return booking.status === 'cancelled' || booking.gate_status === 'cancelled';
}

function isNoShowBooking(booking: { gate_status?: string | null }) {
  return booking.gate_status === 'no_show';
}

export { tenantTodayDateKey };

type LoadOpts = {
  adminClient: SupabaseClient;
  tenantId: string;
  fromDate: string;
  toDate: string;
  tenantTimezone: string;
  checkedInNow?: boolean;
  tenant?: TodayPageData['tenant'];
};

function withRangeEnd<T extends { lt: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
  query: T,
  column: 'start_at' | 'end_at',
  rangeEnd: string
): T {
  return query.lt(column, rangeEnd);
}

export async function loadTodayPageData(opts: LoadOpts): Promise<TodayPageData> {
  const {
    adminClient,
    tenantId,
    fromDate,
    toDate,
    tenantTimezone,
    checkedInNow = false,
    tenant: tenantInput,
  } = opts;

  const { fromUTC, toUTC } = getDateRangeForQuery(fromDate, toDate, tenantTimezone);
  const rangeStart = fromUTC.toISOString();
  const rangeEnd = toUTC.toISOString();

  const now = new Date();
  const todayStr = tenantTodayDateKey(tenantTimezone);

  const [
    arrivalsResult,
    departuresResult,
    currentlyParkedResult,
    rangeBookingsResult,
    currentlyParkedNowResult,
    todayCapacity,
    tenantResult,
  ] = await Promise.all([
    withRangeEnd(
      adminClient
        .from('bookings')
        .select(TODAY_BOOKING_SELECT)
        .eq('tenant_id', tenantId)
        .gte('start_at', rangeStart),
      'start_at',
      rangeEnd
    ).order('start_at', { ascending: false }),

    withRangeEnd(
      adminClient
        .from('bookings')
        .select(TODAY_BOOKING_SELECT)
        .eq('tenant_id', tenantId)
        .gte('end_at', rangeStart),
      'end_at',
      rangeEnd
    ).order('end_at', { ascending: false }),

    adminClient
      .from('bookings')
      .select(TODAY_BOOKING_SELECT)
      .eq('tenant_id', tenantId)
      .eq('status', 'checked_in'),

    withRangeEnd(
      adminClient
        .from('bookings')
        .select('money_received')
        .eq('tenant_id', tenantId)
        .gte('start_at', rangeStart),
      'start_at',
      rangeEnd
    ).not('money_received', 'is', null),

    checkedInNow
      ? adminClient
          .from('bookings')
          .select('id, status, gate_status')
          .eq('tenant_id', tenantId)
          .eq('status', 'checked_in')
      : Promise.resolve({ data: null as { id: string; status: string | null; gate_status: string | null }[] | null, error: null }),

    calculateCapacityForDate(tenantId, todayStr),

    tenantInput
      ? Promise.resolve({ data: tenantInput, error: null })
      : adminClient
          .from('tenants')
          .select('id, name, slug, timezone, default_capacity')
          .eq('id', tenantId)
          .single(),
  ]);

  const queryErrors = [
    arrivalsResult.error,
    departuresResult.error,
    currentlyParkedResult.error,
    rangeBookingsResult.error,
    currentlyParkedNowResult.error,
    tenantResult.error,
  ]
    .filter(Boolean)
    .map((e) => e!.message);

  if (tenantResult.error || !tenantResult.data) {
    throw new Error(queryErrors[0] ?? 'Tenant not found');
  }

  const arrivals = (arrivalsResult.data ?? []) as TodayBookingRow[];
  const departures = (departuresResult.data ?? []) as TodayBookingRow[];
  const currentlyParked = (currentlyParkedResult.data ?? []) as TodayBookingRow[];

  const operationalArrivals = arrivals.filter((b) => !isCancelledBooking(b));
  const operationalDepartures = departures.filter(
    (b) => !isCancelledBooking(b) && !isNoShowBooking(b)
  );
  const operationalCurrentlyParked = currentlyParked.filter(
    (b) => Boolean(b.status && isCurrentlyParked({ status: b.status }) && !isExcludedFromOperations(b.status))
  );

  let checkedInCount: number;
  if (checkedInNow && currentlyParkedNowResult.data) {
    checkedInCount = currentlyParkedNowResult.data.filter(
      (b) => Boolean(b.status && isCurrentlyParked({ status: b.status }) && !isExcludedFromOperations(b.status))
    ).length;
  } else {
    checkedInCount = operationalCurrentlyParked.length;
  }

  const totalCapacity = todayCapacity ?? 0;
  const totalRevenue =
    rangeBookingsResult.data?.reduce((sum, b) => sum + (b.money_received || 0), 0) ?? 0;

  return {
    tenant: tenantResult.data,
    kpis: {
      arrivals: operationalArrivals.length,
      departures: operationalDepartures.length,
      checkedIn: checkedInCount,
      capacityLeft: Math.max(0, totalCapacity - checkedInCount),
      totalRevenue,
    },
    arrivals: operationalArrivals,
    departures: operationalDepartures,
    currentlyParked: operationalCurrentlyParked,
    rangeFrom: fromDate,
    rangeTo: toDate,
    queryError: queryErrors.length > 0 ? queryErrors.join('; ') : undefined,
  };
}

export async function loadTodayPageDataForTenantToday(
  adminClient: SupabaseClient,
  tenantId: string,
  tenantTimezone: string,
  tenant?: TodayPageData['tenant']
) {
  const todayStr = tenantTodayDateKey(tenantTimezone);
  return loadTodayPageData({
    adminClient,
    tenantId,
    fromDate: todayStr,
    toDate: todayStr,
    tenantTimezone,
    checkedInNow: false,
    tenant,
  });
}
