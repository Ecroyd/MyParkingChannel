import { createAdminClient } from "@/lib/supabase/admin";
import {
  ATTRIBUTION_CHANNELS,
  FUNNEL_DISPLAY_STAGES,
  type AttributionChannel,
  type FunnelEventName,
} from "./events";

export type DateRange = { from: string; to: string }; // YYYY-MM-DD inclusive

export type FunnelStageMetrics = {
  key: string;
  label: string;
  eventName: FunnelEventName;
  count: number;
  /** Percentage of previous stage that reached this stage (null for first). */
  conversionFromPrevPct: number | null;
  /** Drop-off from previous stage (null for first). */
  dropOffFromPrevPct: number | null;
  /** Percentage of this stage that reached the next (null for last). */
  conversionToNextPct: number | null;
  dropOffToNextPct: number | null;
};

export type FunnelSummary = {
  stages: FunnelStageMetrics[];
  visitorToBookingPct: number | null;
  searchToBookingPct: number | null;
  checkoutToBookingPct: number | null;
  bookingRevenueCents: number;
  averageBookingValueCents: number | null;
  completedBookings: number;
};

export type AttributionBreakdown = {
  channel: AttributionChannel;
  visitors: number;
  completedBookings: number;
  revenueCents: number;
};

export type MigrationSideMetrics = {
  visitors: number;
  organicVisitors: number | null;
  availabilitySearches: number;
  completedBookings: number;
  conversionRatePct: number | null;
  revenueCents: number;
  averageBookingValueCents: number | null;
};

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function ymdAddDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

/** Seasonality warning when comparison windows span different months/quarters. */
export function seasonalityWarning(before: DateRange, after: DateRange): string | null {
  const beforeStart = new Date(`${before.from}T00:00:00.000Z`);
  const afterStart = new Date(`${after.from}T00:00:00.000Z`);
  const beforeMonth = beforeStart.getUTCMonth();
  const afterMonth = afterStart.getUTCMonth();
  const beforeQuarter = Math.floor(beforeMonth / 3);
  const afterQuarter = Math.floor(afterMonth / 3);

  if (beforeMonth !== afterMonth || beforeQuarter !== afterQuarter) {
    return (
      "Seasonality warning: the before and after windows fall in different months or quarters. " +
      "Airport parking demand varies strongly by holiday and school schedules — treat conversion " +
      "and revenue deltas as directional, not definitive."
    );
  }
  return (
    "Compare like-for-like periods carefully: even adjacent windows can differ by weekday mix " +
    "and local events."
  );
}

type DailyRow = {
  day: string;
  event_name: string;
  attribution_channel: string;
  event_count: number;
  booking_value_cents_sum: number;
};

async function fetchDailyRows(
  tenantId: string,
  range: DateRange,
  channel: string = "all"
): Promise<DailyRow[]> {
  const admin = createAdminClient();
  let query = admin
    .from("website_conversion_daily")
    .select("day, event_name, attribution_channel, event_count, booking_value_cents_sum")
    .eq("tenant_id", tenantId)
    .gte("day", range.from)
    .lte("day", range.to);

  if (channel === "all") {
    query = query.eq("attribution_channel", "all");
  } else {
    query = query.eq("attribution_channel", channel);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[website-performance] daily fetch", error.message);
    return [];
  }
  return (data ?? []) as DailyRow[];
}

function sumEvent(rows: DailyRow[], eventName: FunnelEventName): number {
  return rows
    .filter((r) => r.event_name === eventName)
    .reduce((acc, r) => acc + Number(r.event_count || 0), 0);
}

function sumRevenue(rows: DailyRow[]): number {
  return rows
    .filter((r) => r.event_name === "booking_completed")
    .reduce((acc, r) => acc + Number(r.booking_value_cents_sum || 0), 0);
}

export function buildFunnelSummary(rows: DailyRow[]): FunnelSummary {
  const counts = FUNNEL_DISPLAY_STAGES.map((stage) => sumEvent(rows, stage.eventName));
  const stages: FunnelStageMetrics[] = FUNNEL_DISPLAY_STAGES.map((stage, i) => {
    const count = counts[i] ?? 0;
    const prev = i > 0 ? (counts[i - 1] ?? 0) : null;
    const next = i < counts.length - 1 ? (counts[i + 1] ?? 0) : null;
    const conversionFromPrevPct = prev == null ? null : pct(count, prev);
    const dropOffFromPrevPct =
      prev == null || conversionFromPrevPct == null ? null : Math.round((100 - conversionFromPrevPct) * 10) / 10;
    const conversionToNextPct = next == null ? null : pct(next, count);
    const dropOffToNextPct =
      conversionToNextPct == null ? null : Math.round((100 - conversionToNextPct) * 10) / 10;
    return {
      key: stage.key,
      label: stage.label,
      eventName: stage.eventName,
      count,
      conversionFromPrevPct,
      dropOffFromPrevPct,
      conversionToNextPct,
      dropOffToNextPct,
    };
  });

  const visitors = counts[0] ?? 0;
  const searches = counts[1] ?? 0;
  const checkouts = counts[3] ?? 0;
  const completed = counts[4] ?? 0;
  const revenue = sumRevenue(rows);

  return {
    stages,
    visitorToBookingPct: pct(completed, visitors),
    searchToBookingPct: pct(completed, searches),
    checkoutToBookingPct: pct(completed, checkouts),
    bookingRevenueCents: revenue,
    averageBookingValueCents: completed > 0 ? Math.round(revenue / completed) : null,
    completedBookings: completed,
  };
}

export async function getFunnelSummaryForTenant(
  tenantId: string,
  range: DateRange
): Promise<FunnelSummary> {
  const rows = await fetchDailyRows(tenantId, range, "all");
  return buildFunnelSummary(rows);
}

export async function getAttributionBreakdown(
  tenantId: string,
  range: DateRange
): Promise<AttributionBreakdown[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("website_conversion_daily")
    .select("event_name, attribution_channel, event_count, booking_value_cents_sum")
    .eq("tenant_id", tenantId)
    .gte("day", range.from)
    .lte("day", range.to)
    .neq("attribution_channel", "all");

  if (error) {
    console.error("[website-performance] attribution fetch", error.message);
    return [];
  }

  const byChannel = new Map<AttributionChannel, AttributionBreakdown>();
  for (const ch of ATTRIBUTION_CHANNELS) {
    byChannel.set(ch, {
      channel: ch,
      visitors: 0,
      completedBookings: 0,
      revenueCents: 0,
    });
  }

  for (const row of data ?? []) {
    const ch = row.attribution_channel as AttributionChannel;
    if (!byChannel.has(ch)) continue;
    const bucket = byChannel.get(ch)!;
    if (row.event_name === "website_session") {
      bucket.visitors += Number(row.event_count || 0);
    }
    if (row.event_name === "booking_completed") {
      bucket.completedBookings += Number(row.event_count || 0);
      bucket.revenueCents += Number(row.booking_value_cents_sum || 0);
    }
  }

  // Only return channels that have any signal — do not fake empty attribution as "data".
  return ATTRIBUTION_CHANNELS.map((ch) => byChannel.get(ch)!)
    .filter((b) => b.visitors > 0 || b.completedBookings > 0);
}

function sideMetrics(rows: DailyRow[], organicRows: DailyRow[]): MigrationSideMetrics {
  const visitors = sumEvent(rows, "website_session");
  const searches = sumEvent(rows, "availability_search");
  const completed = sumEvent(rows, "booking_completed");
  const revenue = sumRevenue(rows);
  const organicVisitors = sumEvent(organicRows, "website_session");
  return {
    visitors,
    organicVisitors: organicVisitors > 0 ? organicVisitors : organicRows.length ? 0 : null,
    availabilitySearches: searches,
    completedBookings: completed,
    conversionRatePct: pct(completed, visitors),
    revenueCents: revenue,
    averageBookingValueCents: completed > 0 ? Math.round(revenue / completed) : null,
  };
}

export type MigrationComparisonResult = {
  migrationDate: string;
  comparisonDays: number;
  beforeRange: DateRange;
  afterRange: DateRange;
  before: MigrationSideMetrics;
  after: MigrationSideMetrics;
  seasonalityWarning: string | null;
  likeForLike: boolean;
};

/**
 * Like-for-like migration comparison: N days immediately before migration date
 * vs N days starting on migration date.
 */
export async function getMigrationComparison(
  tenantId: string,
  migrationDate: string,
  comparisonDays: number
): Promise<MigrationComparisonResult> {
  const days = Math.min(365, Math.max(1, Math.floor(comparisonDays)));
  const beforeTo = ymdAddDays(migrationDate, -1);
  const beforeFrom = ymdAddDays(beforeTo, -(days - 1));
  const afterFrom = migrationDate;
  const afterTo = ymdAddDays(afterFrom, days - 1);

  const beforeRange = { from: beforeFrom, to: beforeTo };
  const afterRange = { from: afterFrom, to: afterTo };

  const [beforeRows, afterRows, beforeOrganic, afterOrganic] = await Promise.all([
    fetchDailyRows(tenantId, beforeRange, "all"),
    fetchDailyRows(tenantId, afterRange, "all"),
    fetchDailyRows(tenantId, beforeRange, "organic"),
    fetchDailyRows(tenantId, afterRange, "organic"),
  ]);

  const likeForLike =
    daysBetweenInclusive(beforeRange.from, beforeRange.to) ===
    daysBetweenInclusive(afterRange.from, afterRange.to);

  return {
    migrationDate,
    comparisonDays: days,
    beforeRange,
    afterRange,
    before: sideMetrics(beforeRows, beforeOrganic),
    after: sideMetrics(afterRows, afterOrganic),
    seasonalityWarning: seasonalityWarning(beforeRange, afterRange),
    likeForLike,
  };
}

export function resolvePresetRange(
  preset: "today" | "7d" | "30d" | "90d" | "custom",
  customFrom?: string,
  customTo?: string,
  todayYmd?: string
): DateRange {
  const today = todayYmd || new Date().toISOString().slice(0, 10);
  if (preset === "custom" && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") return { from: ymdAddDays(today, -6), to: today };
  if (preset === "90d") return { from: ymdAddDays(today, -89), to: today };
  return { from: ymdAddDays(today, -29), to: today };
}
