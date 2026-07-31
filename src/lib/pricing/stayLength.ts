// src/lib/pricing/stayLength.ts

import {
  DEFAULT_TENANT_TIMEZONE,
  tenantDateKeyFromUtc,
} from '@/lib/datetime/parse';

/**
 * Calculate billable stay length in days for parking.
 * This is the single source of truth for length-of-stay pricing.
 *
 * Rules (inclusive calendar days — not hotel nights):
 * - Count every tenant-local calendar date the car is on site, including arrival and departure
 * - Jun 1 → Jun 8 = 8 days
 * - Same calendar day = 1 day
 * - Clock times do not change the day count (only the local dates matter)
 * - Inverted dates = 1 day (clamped)
 */
export function calculateStayDays(
  startAt: Date,
  endAt: Date,
  timezone: string = DEFAULT_TENANT_TIMEZONE,
): number {
  const startMs = startAt.getTime();
  const endMs = endAt.getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 1;
  }

  const startKey = tenantDateKeyFromUtc(startAt.toISOString(), timezone);
  const endKey = tenantDateKeyFromUtc(endAt.toISOString(), timezone);

  if (!startKey || !endKey) {
    return 1;
  }

  const startDay = Date.parse(`${startKey}T00:00:00.000Z`);
  const endDay = Date.parse(`${endKey}T00:00:00.000Z`);
  if (!Number.isFinite(startDay) || !Number.isFinite(endDay) || endDay < startDay) {
    return 1;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const nightSpan = Math.round((endDay - startDay) / msPerDay);
  // Inclusive: arrival day + departure day both billable
  return Math.max(1, nightSpan + 1);
}
