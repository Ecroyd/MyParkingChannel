export const ANPR_DEFAULT_PAGE_SIZE = 50;
export const ANPR_MAX_PAGE_SIZE = 100;
export const ANPR_DEFAULT_LOOKBACK_DAYS = 7;

export function enforceAnprPageSize(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return ANPR_DEFAULT_PAGE_SIZE;
  return Math.min(ANPR_MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

export function defaultAnprDateFrom(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - ANPR_DEFAULT_LOOKBACK_DAYS);
  return d.toISOString();
}

/**
 * Resolve event time bounds. Always applies a lower bound (default last 7 days)
 * unless an explicit wider `from` is provided.
 */
export function resolveAnprEventTimeBounds(opts: {
  from?: string | null;
  to?: string | null;
  now?: Date;
}): { fromIso: string; toIso: string | null } {
  const now = opts.now ?? new Date();
  let fromIso = defaultAnprDateFrom(now);
  let toIso: string | null = null;

  if (opts.from) {
    const parsed = new Date(opts.from.includes('T') ? opts.from : `${opts.from}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) {
      fromIso = parsed.toISOString();
    }
  }

  if (opts.to) {
    const parsed = new Date(opts.to.includes('T') ? opts.to : `${opts.to}T23:59:59.999Z`);
    if (!Number.isNaN(parsed.getTime())) {
      toIso = parsed.toISOString();
    }
  }

  return { fromIso, toIso };
}
