/**
 * Date/time parsing utilities for supplier imports and tenant display.
 *
 * Supplier booking times are car park local times (default Europe/London).
 * Store UTC timestamptz; display once in tenant timezone.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { startOfDay } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import path from 'path';

export const DEFAULT_TENANT_TIMEZONE = 'Europe/London';

export type ParseTenantLocalDateTimeInput = {
  date: string;
  time: string;
  timezone?: string;
};

/**
 * Strip erroneous UTC suffix from supplier-local naive datetimes.
 * e.g. 2026-06-25T14:00:00.000Z → 2026-06-25T14:00:00
 */
export function sanitizeSupplierDateTimeInput(raw: string): string {
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/i.test(s)) {
    return s.replace(/(\.\d+)?Z$/i, '').replace(/\.\d+$/, '');
  }
  return s;
}

/**
 * Convert a tenant-local date/time pair into a UTC ISO string.
 * Accepts DD/MM/YYYY, YYYY-MM-DD, HH:mm, and HHmm.
 */
export function parseTenantLocalDateTimeToUtc(
  input: ParseTenantLocalDateTimeInput
): string | null;
export function parseTenantLocalDateTimeToUtc(
  dateRaw: string,
  timeRaw: string,
  tenantTimezone?: string
): string | null;
export function parseTenantLocalDateTimeToUtc(
  dateOrInput: string | ParseTenantLocalDateTimeInput,
  timeArg?: string,
  timezoneArg: string = DEFAULT_TENANT_TIMEZONE
): string | null {
  let dateText: string;
  let timeText: string;
  let tenantTimezone: string;

  if (typeof dateOrInput === 'object') {
    dateText = String(dateOrInput.date ?? '').trim();
    timeText = String(dateOrInput.time ?? '').trim();
    tenantTimezone = dateOrInput.timezone ?? DEFAULT_TENANT_TIMEZONE;
  } else {
    dateText = String(dateOrInput ?? '').trim();
    timeText = String(timeArg ?? '').trim();
    tenantTimezone = timezoneArg;
  }

  const dateMatch =
    dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) ||
    dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const timeMatch = timeText.match(/^(\d{1,2}):?(\d{2})$/);

  if (!dateMatch || !timeMatch) return null;

  const ymd = dateText.includes('-')
    ? { year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]) }
    : {
        year: Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]),
        month: Number(dateMatch[2]),
        day: Number(dateMatch[1]),
      };

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (
    ymd.month < 1 ||
    ymd.month > 12 ||
    ymd.day < 1 ||
    ymd.day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  const localIso = `${ymd.year.toString().padStart(4, '0')}-${ymd.month
    .toString()
    .padStart(2, '0')}-${ymd.day.toString().padStart(2, '0')}T${hour
    .toString()
    .padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

  return zonedTimeToUtc(localIso, tenantTimezone).toISOString();
}

/**
 * Build a naive tenant-local ISO string for staging (no Z suffix).
 */
export function buildTenantLocalIso(dateRaw: string, timeRaw: string): string | null {
  const dateText = String(dateRaw ?? '').trim();
  const timeText = String(timeRaw ?? '').trim();
  const dateMatch =
    dateText.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) ||
    dateText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const timeMatch = timeText.match(/^(\d{1,2}):?(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const ymd = dateText.includes('-')
    ? { year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]) }
    : {
        year: Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]),
        month: Number(dateMatch[2]),
        day: Number(dateMatch[1]),
      };

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return null;

  return `${ymd.year.toString().padStart(4, '0')}-${ymd.month
    .toString()
    .padStart(2, '0')}-${ymd.day.toString().padStart(2, '0')}T${hour
    .toString()
    .padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
}

/**
 * Parse naive local ISO (YYYY-MM-DDTHH:mm:ss) as tenant-local and return UTC.
 */
export function parseNaiveLocalIsoToUtc(
  naiveIso: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): string | null {
  const s = sanitizeSupplierDateTimeInput(naiveIso).replace(' ', 'T');
  const match = s.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const localIso = `${match[1]}T${match[2]}:${match[3]}:${match[4] ?? '00'}`;
  return zonedTimeToUtc(localIso, timezone).toISOString();
}

/**
 * Parse common supplier datetime strings as tenant-local → UTC.
 */
export function parseSupplierDateTimeToUtc(
  raw: string | null | undefined,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): string | null {
  if (raw == null || String(raw).trim() === '') return null;
  const s = sanitizeSupplierDateTimeInput(String(raw).trim());

  const dmyHm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyHm) {
    return parseTenantLocalDateTimeToUtc(
      `${dmyHm[1]}/${dmyHm[2]}/${dmyHm[3]}`,
      `${dmyHm[4]}:${dmyHm[5]}`,
      timezone
    );
  }

  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
    return parseNaiveLocalIsoToUtc(s, timezone);
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    return parseTenantLocalDateTimeToUtc(s, '00:00', timezone);
  }

  return null;
}

/**
 * Resolve supplier start/end strings to UTC for storage.
 */
export function resolveBookingTimesToUtc(
  startRaw: string,
  endRaw: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): { start_at: string; end_at: string } | null {
  const start =
    parseSupplierDateTimeToUtc(startRaw, timezone) ??
    parseNaiveLocalIsoToUtc(sanitizeSupplierDateTimeInput(startRaw), timezone);
  const end =
    parseSupplierDateTimeToUtc(endRaw, timezone) ??
    parseNaiveLocalIsoToUtc(sanitizeSupplierDateTimeInput(endRaw), timezone);

  if (!start || !end) return null;

  let endAt = end;
  if (new Date(endAt).getTime() <= new Date(start).getTime()) {
    endAt = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
  }

  return { start_at: start, end_at: endAt };
}

/** YYYY-MM-DD date key in tenant timezone from a UTC timestamp. */
export function tenantDateKeyFromUtc(
  timestamp: string | null | undefined,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Format UTC timestamp for tenant-facing display (single conversion). */
export function formatBookingDateTimeForTenant(opts: {
  timestamp: string | null | undefined;
  timezone?: string;
}): string {
  if (!opts.timestamp) return '';
  const date = new Date(opts.timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const tz = opts.timezone ?? DEFAULT_TENANT_TIMEZONE;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')} ${get('month')}, ${get('hour')}:${get('minute')}`;
}

/**
 * Parse booking start and end times using Postgres RPC function
 */
export async function parseBookingTimes(
  startRaw: string,
  endRaw: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): Promise<{ start_utc: string; end_utc: string } | null> {
  const supabase = createAdminClient();

  const { data: parsed, error: parseErr } = await supabase
    .rpc('normalise_booking_times', {
      p_start: sanitizeSupplierDateTimeInput(startRaw),
      p_end: sanitizeSupplierDateTimeInput(endRaw),
      p_tz: timezone
    });

  if (parseErr || !parsed || parsed.length === 0) {
    console.error('Failed to parse booking times:', parseErr);
    return null;
  }

  const { start_utc, end_utc } = parsed[0];

  if (!start_utc || !end_utc) {
    console.error('Parsed dates are null');
    return null;
  }

  return {
    start_utc: start_utc,
    end_utc: end_utc
  };
}

export async function parseDateTimeToUtc(
  dateRaw: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE
): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .rpc('parse_datetime_to_utc', {
      p_text: sanitizeSupplierDateTimeInput(dateRaw),
      p_tz: timezone
    });

  if (error || !data) {
    console.error('Failed to parse datetime:', error);
    return null;
  }

  return data;
}

export function overrideStartToMidnight(
  startUtc: string,
  tenantTimezone: string = DEFAULT_TENANT_TIMEZONE
): string {
  const startDate = new Date(startUtc);
  const tenantDate = utcToZonedTime(startDate, tenantTimezone);
  const startOfDayInTenant = startOfDay(tenantDate);
  const startOfDayUtc = zonedTimeToUtc(startOfDayInTenant, tenantTimezone);
  return startOfDayUtc.toISOString();
}

export function isExtz10File(filename: string): boolean {
  const basename = path.basename(filename);
  return basename.toUpperCase().startsWith('EXTZ10');
}
