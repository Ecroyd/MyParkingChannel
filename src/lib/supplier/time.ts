import { zonedTimeToUtc } from 'date-fns-tz';

export const SUPPLIER_DEFAULT_TIMEZONE = 'Europe/London';

// Date-only or date+time with no zone designator, e.g. "2026-06-01T10:00", "2026-06-01 10:00:00.000".
const NAIVE_ISO = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/;

/**
 * Supplier API timestamps without an explicit offset are car-park local time
 * (Europe/London), not server UTC. Returns a UTC ISO string for those.
 * Inputs with `Z` / `±hh:mm` (or anything else non-naive) are returned unchanged.
 */
export function normalizeSupplierTimestamp(
  raw: string,
  timezone: string = SUPPLIER_DEFAULT_TIMEZONE
): string {
  const s = String(raw).trim();
  if (!NAIVE_ISO.test(s)) return raw;
  const d = zonedTimeToUtc(s.replace(' ', 'T'), timezone);
  return isNaN(d.getTime()) ? raw : d.toISOString();
}
