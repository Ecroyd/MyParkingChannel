// src/lib/suppliers/cavuCursor.ts
//
// Pure helpers for the CAVU events cursor (tenant_supplier_configs.config.last_synced_at).
// The cron fetches "events from the last N hours" where N = ceil(now - cursor), capped at 168h.
import { parseSupplierDateTimeToUtc } from '@/lib/datetime/parse';

export type CavuFailureKind = 'permanent' | 'transient';

export type CavuEventOutcome = {
  reference: string | null;
  /** Raw CAVU EventDate (car-park local time, possibly with a bogus "Z"). */
  eventDate: string | null;
  status: 'ok' | CavuFailureKind;
};

/** Margin subtracted from the earliest retryable event so the next window certainly contains it. */
export const CURSOR_SAFETY_MARGIN_MS = 60 * 60 * 1000;

/**
 * Classify an error thrown by a CAVU API call or returned by Supabase.
 * Transient (retry on the next run): network failures, timeouts, HTTP 429 and 5xx, DB errors that
 * are not data errors. Permanent (skip, keep the record in the run's errors): other 4xx (e.g. 404
 * booking not found), invalid dates (RangeError), Postgres data/constraint errors (SQLSTATE 22/23).
 */
export function classifyCavuError(err: unknown): CavuFailureKind {
  if (err instanceof RangeError) return 'permanent';
  const e = err as { code?: unknown; message?: unknown; status?: unknown } | null | undefined;
  if (e?.code === 'CAVU_RATE_LIMIT') return 'transient';
  if (typeof e?.code === 'string' && /^2[23][0-9A-Z]{3}$/.test(e.code)) return 'permanent';
  const msg = typeof e?.message === 'string' ? e.message : String(err ?? '');
  const m = msg.match(/CAVU request failed: (\d{3})/);
  const status = m ? Number(m[1]) : typeof e?.status === 'number' ? e.status : null;
  if (status !== null) {
    if (status === 429 || status === 408 || status >= 500) return 'transient';
    if (status >= 400) return 'permanent';
  }
  if (/invalid input syntax|violates .* constraint|out of range|invalid time value/i.test(msg)) {
    return 'permanent';
  }
  return 'transient';
}

export type CursorDecision =
  | { advance: true; cursor: string; reason: string }
  | { advance: false; cursor: null; reason: string };

/**
 * Decide where to move the cursor after a run.
 * - Event list could not be fetched (or was not an array): don't move.
 * - Every event succeeded or failed permanently: move to when the fetch started.
 * - Some events failed transiently (or were never reached, e.g. after a 429): move only up to just
 *   before the earliest of those, so they are re-fetched; if that's not ahead of the current
 *   cursor (or an event date is unreadable) don't move.
 */
export function decideCavuCursor(input: {
  fetchOk: boolean;
  fetchStartedAt: Date;
  previousCursor: string | null | undefined;
  outcomes: CavuEventOutcome[];
  timezone?: string;
}): CursorDecision {
  if (!input.fetchOk) {
    return { advance: false, cursor: null, reason: 'event list fetch failed' };
  }
  const retry = input.outcomes.filter((o) => o.status === 'transient');
  if (retry.length === 0) {
    return { advance: true, cursor: input.fetchStartedAt.toISOString(), reason: 'all events done' };
  }

  let earliest = Infinity;
  for (const o of retry) {
    let t = NaN;
    try {
      const utc = o.eventDate ? parseSupplierDateTimeToUtc(o.eventDate, input.timezone) : null;
      t = utc ? Date.parse(utc) : NaN;
    } catch {
      t = NaN;
    }
    if (!Number.isFinite(t)) {
      return { advance: false, cursor: null, reason: 'transient failure with unreadable EventDate' };
    }
    earliest = Math.min(earliest, t);
  }

  const target = Math.min(earliest - CURSOR_SAFETY_MARGIN_MS, input.fetchStartedAt.getTime());
  const prev = input.previousCursor ? Date.parse(input.previousCursor) : NaN;
  if (Number.isFinite(prev) && target <= prev) {
    return { advance: false, cursor: null, reason: `${retry.length} transient failure(s) at cursor` };
  }
  return {
    advance: true,
    cursor: new Date(target).toISOString(),
    reason: `${retry.length} transient failure(s); cursor held before earliest`,
  };
}
