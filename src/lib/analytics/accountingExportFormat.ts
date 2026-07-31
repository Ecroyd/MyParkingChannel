import { calculateStayDays } from '@/lib/pricing/stayLength';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';

/** Prefer platform/channel id when present; otherwise booking source. */
export function exportChannel(row: {
  external_source?: string | null;
  source?: string | null;
}): string {
  const ext = row.external_source?.trim();
  const src = row.source?.trim();
  if (ext) return ext;
  if (src) return src;
  return 'other';
}

/** Excel-friendly UK local datetime: DD/MM/YYYY HH:mm */
export function formatExportDateTime(
  timestamp: string | null | undefined,
  timezone: string = DEFAULT_TENANT_TIMEZONE,
): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

export function exportStayDays(
  startAt: string | null | undefined,
  endAt: string | null | undefined,
  timezone: string = DEFAULT_TENANT_TIMEZONE,
): number {
  if (!startAt || !endAt) return 1;
  return calculateStayDays(new Date(startAt), new Date(endAt), timezone);
}

/**
 * Inclusive local calendar date range → UTC bounds for timestamptz filters.
 * `to` is inclusive as a calendar day in the tenant timezone.
 */
export function exportDateRangeUtcBounds(
  from: string,
  to: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE,
): { fromUtc: string; toUtcExclusive: string } {
  // Interpret YYYY-MM-DD midnights in tenant TZ via Intl + iterative offset
  const startLocal = localDateToUtcIso(from, timezone);
  const endNextLocal = addOneCalendarDay(to);
  const endExclusive = localDateToUtcIso(endNextLocal, timezone);
  return { fromUtc: startLocal, toUtcExclusive: endExclusive };
}

function addOneCalendarDay(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + 1);
  return utc.toISOString().slice(0, 10);
}

/** Convert a tenant-local calendar date (midnight) to a UTC ISO timestamp. */
function localDateToUtcIso(yyyyMmDd: string, timezone: string): string {
  // Guess UTC midnight, then adjust by the timezone offset at that instant
  const probe = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  const offsetMs = tzOffsetMs(probe, timezone);
  const corrected = new Date(probe.getTime() - offsetMs);
  // Re-check offset in case of DST boundary
  const offset2 = tzOffsetMs(corrected, timezone);
  if (offset2 !== offsetMs) {
    return new Date(probe.getTime() - offset2).toISOString();
  }
  return corrected.toISOString();
}

function tzOffsetMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  // e.g. "GMT+1", "GMT+01:00", "GMT", "UTC"
  const match = tzName.match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const mins = Number(match[3] ?? '0');
  return sign * (hours * 60 + mins) * 60 * 1000;
}

export function money2(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}
