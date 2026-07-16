import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateCapacityForDate } from '@/lib/capacity/rolling';
import { getDateRangeForQuery, tenantTodayDateKey } from '@/lib/timezone';
import { TODAY_BOOKING_SELECT, type TodayBookingRow } from '@/lib/today/bookingSelect';
import {
  isCancelledBooking,
  isNoShowBooking,
} from '@/lib/ops/parkedState';
import {
  getCurrentOccupancy,
  isAuthoritativeOnSite,
} from '@/lib/analytics/occupancyTimeseries';
import { GATE_STATUS } from '@/lib/gateStatus';

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
  occupancyDataQuality?: {
    missingArrivalDespiteOnSite: number;
    openButCancelledOrNoShow: number;
    departureBeforeArrival: number;
    duplicateActiveArrivalEvents: number;
    negativeOccupancyDetected: boolean;
  };
  occupancyMode?: string;
  rangeFrom: string;
  rangeTo: string;
  queryError?: string;
};

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
    tenant: tenantInput,
  } = opts;

  const { fromUTC, toUTC } = getDateRangeForQuery(fromDate, toDate, tenantTimezone);
  const rangeStart = fromUTC.toISOString();
  const rangeEnd = toUTC.toISOString();

  const todayStr = tenantTodayDateKey(tenantTimezone);

  const [
    arrivalsResult,
    departuresResult,
    currentlyParkedResult,
    rangeBookingsResult,
    todayCapacity,
    tenantResult,
    currentOccupancy,
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

    // Candidate set for the parked sheet — KPI count comes from getCurrentOccupancy.
    adminClient
      .from('bookings')
      .select(TODAY_BOOKING_SELECT)
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .or(
        [
          `gate_status.eq.${GATE_STATUS.ARRIVED}`,
          `gate_status.eq.${GATE_STATUS.ARRIVED_KEY_TAKEN}`,
          'and(arrived_at.not.is.null,departed_at.is.null)',
          'and(checked_in_at.not.is.null,checked_out_at.is.null,status.eq.checked_in)',
        ].join(',')
      )
      .order('arrived_at', { ascending: false }),

    withRangeEnd(
      adminClient
        .from('bookings')
        .select('money_received')
        .eq('tenant_id', tenantId)
        .gte('start_at', rangeStart),
      'start_at',
      rangeEnd
    ).not('money_received', 'is', null),

    calculateCapacityForDate(tenantId, todayStr),

    tenantInput
      ? Promise.resolve({ data: tenantInput, error: null })
      : adminClient
          .from('tenants')
          .select('id, name, slug, timezone, default_capacity')
          .eq('id', tenantId)
          .single(),

    getCurrentOccupancy(tenantId),
  ]);

  const queryErrors = [
    arrivalsResult.error,
    departuresResult.error,
    currentlyParkedResult.error,
    rangeBookingsResult.error,
    tenantResult.error,
  ]
    .filter(Boolean)
    .map((e) => e!.message);

  if (tenantResult.error || !tenantResult.data) {
    throw new Error(queryErrors[0] ?? 'Tenant not found');
  }

  const arrivals = (arrivalsResult.data ?? []) as TodayBookingRow[];
  const departures = (departuresResult.data ?? []) as TodayBookingRow[];
  const currentlyParkedRaw = (currentlyParkedResult.data ?? []) as TodayBookingRow[];

  const operationalArrivals = arrivals.filter((b) => !isCancelledBooking(b));
  const operationalDepartures = departures.filter(
    (b) => !isCancelledBooking(b) && !isNoShowBooking(b)
  );
  // Sheet list uses authoritative on-site; KPI uses shared resolver.
  const operationalCurrentlyParked = currentlyParkedRaw.filter(isAuthoritativeOnSite);

  const checkedInCount = currentOccupancy.occupiedCount;
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
    occupancyDataQuality: currentOccupancy.dataQuality,
    occupancyMode: currentOccupancy.mode,
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
