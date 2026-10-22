// Pure helpers for customer-initiated stay changes (extend / move dates) on the
// public manage-booking page. No I/O here so the rules can be unit tested.

export const EXTENSION_PLATFORM_FEE_RATE = 0.1;

/** booking_extensions.note for customer (manage-booking) extensions awaiting/after payment. */
export const CUSTOMER_EXTENSION_NOTE = 'Customer extension via manage-booking';

/** Truncate an ISO timestamp to the minute (the UI's datetime-local precision). */
export function toMinuteMs(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return NaN;
  return Math.floor(t / 60000) * 60000;
}

/** True when two timestamps fall in the same minute (unchanged as far as the form is concerned). */
export function sameMinute(a: string, b: string): boolean {
  const x = toMinuteMs(a);
  const y = toMinuteMs(b);
  return !Number.isNaN(x) && x === y;
}

/** Price difference in pence between two stay totals expressed in pounds. */
export function priceDifferenceCents(oldTotalPounds: number, newTotalPounds: number): number {
  const oldCents = Math.round((Number(oldTotalPounds) || 0) * 100);
  const newCents = Math.round((Number(newTotalPounds) || 0) * 100);
  return newCents - oldCents;
}

/** Platform application fee for a connected-account charge, always computed server-side. */
export function platformFeeCents(amountCents: number): number {
  return Math.max(0, Math.round(amountCents * EXTENSION_PLATFORM_FEE_RATE));
}

export type DateChangeDecision =
  | { kind: 'unchanged' }
  | { kind: 'invalid'; message: string }
  | { kind: 'needs_quote' } // dates change; call again with prices
  | { kind: 'free' } // same or lower price: may be applied directly (after capacity check)
  | { kind: 'needs_payment'; differenceCents: number };

/**
 * Decide whether a requested start/end change can be applied without payment.
 * Call first without prices: returns 'unchanged' / 'invalid' / 'needs_quote'. Then call again with
 * `oldPriceCents` / `newPriceCents` to get 'free' or 'needs_payment'.
 */
export function classifyDateChange(opts: {
  currentStartAt: string;
  currentEndAt: string;
  newStartAt: string;
  newEndAt: string;
  oldPriceCents?: number;
  newPriceCents?: number;
}): DateChangeDecision {
  const { currentStartAt, currentEndAt, newStartAt, newEndAt } = opts;
  const ns = new Date(newStartAt).getTime();
  const ne = new Date(newEndAt).getTime();
  if (Number.isNaN(ns) || Number.isNaN(ne)) {
    return { kind: 'invalid', message: 'Please enter valid drop-off and pick-up times.' };
  }
  if (sameMinute(currentStartAt, newStartAt) && sameMinute(currentEndAt, newEndAt)) {
    return { kind: 'unchanged' };
  }
  if (ne <= ns) {
    return { kind: 'invalid', message: 'Pick-up must be after drop-off.' };
  }
  if (opts.oldPriceCents === undefined || opts.newPriceCents === undefined) {
    return { kind: 'needs_quote' };
  }
  const diff = opts.newPriceCents - opts.oldPriceCents;
  if (diff > 0) return { kind: 'needs_payment', differenceCents: diff };
  return { kind: 'free' };
}

/**
 * End time to apply for a paid extension. Never moves the end earlier than it already is
 * (e.g. two extensions paid out of order, or a re-delivered webhook).
 */
export function resolveExtendedEndAt(currentEndAt: string, paidNewEndAt: string): string {
  const cur = new Date(currentEndAt).getTime();
  const next = new Date(paidNewEndAt).getTime();
  if (Number.isNaN(next)) return currentEndAt;
  if (Number.isNaN(cur) || next > cur) return new Date(next).toISOString();
  return currentEndAt;
}

/** Add a paid amount (pence) to a numeric pounds column, rounding to 2dp. */
export function addPenceToPounds(currentPounds: number | string | null | undefined, addCents: number): number {
  const cur = Math.round((Number(currentPounds) || 0) * 100);
  return (cur + Math.max(0, Math.round(addCents))) / 100;
}

/**
 * Where Stripe should send the customer after paying: back to the manage-booking page on the
 * site they came from (custom domain or subdomain, so the session cookie still applies).
 * Falls back to `fallbackUrl` when the request carries no usable Origin.
 */
export function buildManageBookingReturnUrl(opts: {
  origin: string | null | undefined;
  referer: string | null | undefined;
  fallbackUrl: string;
  query: string; // e.g. 'extended=1'
}): string {
  let base: URL | null = null;
  try {
    if (opts.origin) {
      const o = new URL(opts.origin);
      if (o.protocol === 'https:' || o.protocol === 'http:') {
        let path = '/manage-booking';
        if (opts.referer) {
          try {
            const r = new URL(opts.referer);
            if (r.origin === o.origin && r.pathname.endsWith('/manage-booking')) path = r.pathname;
          } catch {
            /* ignore bad referer */
          }
        }
        base = new URL(path, o.origin);
      }
    }
  } catch {
    base = null;
  }
  if (!base) base = new URL(opts.fallbackUrl);
  base.search = opts.query;
  return base.toString();
}
