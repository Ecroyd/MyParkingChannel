// src/lib/pricing/stayLength.ts

/**
 * Calculate stay length in days based on elapsed time.
 * This is the single source of truth for length-of-stay calculations.
 * 
 * Rules:
 * - Uses elapsed time (not calendar dates)
 * - Uses Math.ceil to round up partial days
 * - Minimum of 1 day
 * - Does NOT add +1 (pure elapsed time calculation)
 * 
 * Examples:
 * - 10 Dec 11:50 → 20 Dec 11:50 = 10 days
 * - 10 Dec 11:50 → 20 Dec 11:51 = 11 days (ceil)
 * - Identical timestamps = 1 day
 * - End before start = 1 day (clamped)
 */
export function calculateStayDays(startAt: Date, endAt: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;

  const startMs = startAt.getTime();
  const endMs = endAt.getTime();

  const diffMs = endMs - startMs;

  // Protect against inverted dates
  if (diffMs <= 0) {
    return 1;
  }

  const rawDays = diffMs / msPerDay;
  const days = Math.ceil(rawDays);

  return Math.max(1, days);
}

