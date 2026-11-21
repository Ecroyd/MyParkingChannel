// src/lib/promo/promoCodes.ts
//
// Promo codes customers type on a car park's booking site. Pure rules (no database) so the
// widget's "Apply" check and the checkout that charges the card always agree.

export type PromoDiscountType = 'percent' | 'fixed';

export type PromoCode = {
  id: string;
  tenant_id: string;
  code: string;
  description: string | null;
  discount_type: PromoDiscountType;
  discount_value: number;
  valid_from: string | null; // YYYY-MM-DD (UK)
  valid_until: string | null; // YYYY-MM-DD (UK)
  max_uses: number | null;
  min_spend: number | null;
  times_used: number;
  is_active: boolean;
};

/** Stripe will not take a card payment below this (GBP). */
export const MIN_CHARGE_POUNDS = 0.3;

export const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;

/** Upper case, spaces removed: "summer 10" -> "SUMMER10". */
export function normalizePromoCode(input: unknown): string {
  return String(input ?? '')
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Today's date in the UK as YYYY-MM-DD (codes are valid by UK calendar day). */
export function ukDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const roundPence = (n: number) => Math.round(n * 100) / 100;

export type PromoResult =
  | { ok: true; code: string; discount: number; finalAmount: number; label: string }
  | { ok: false; reason: string };

/** Short description of the discount, e.g. "10% off" or "£5.00 off". */
export function describeDiscount(type: PromoDiscountType, value: number): string {
  return type === 'percent' ? `${Number(value)}% off` : `£${Number(value).toFixed(2)} off`;
}

/**
 * Whether `promo` can be used now on a booking costing `amount` (pounds, before the discount),
 * and if so how much it takes off. Reasons are worded for the customer.
 */
export function evaluatePromoCode(
  promo: PromoCode | null | undefined,
  amount: number,
  now: Date = new Date()
): PromoResult {
  if (!promo || !promo.is_active) return { ok: false, reason: "That code isn't valid." };

  const today = ukDateString(now);
  if (promo.valid_from && today < promo.valid_from) {
    return { ok: false, reason: "That code isn't valid yet." };
  }
  if (promo.valid_until && today > promo.valid_until) {
    return { ok: false, reason: 'That code has expired.' };
  }
  if (promo.max_uses != null && promo.times_used >= promo.max_uses) {
    return { ok: false, reason: 'That code has been fully used.' };
  }
  if (promo.min_spend != null && amount < Number(promo.min_spend)) {
    return {
      ok: false,
      reason: `That code needs a booking of at least £${Number(promo.min_spend).toFixed(2)}.`,
    };
  }
  if (!(amount > 0)) return { ok: false, reason: "That code can't be used on this booking." };

  const value = Number(promo.discount_value);
  const raw = promo.discount_type === 'percent' ? (amount * value) / 100 : value;
  const discount = roundPence(Math.min(raw, amount));
  const finalAmount = roundPence(amount - discount);

  // Card payments need a minimum charge, so a code can't bring the price to (almost) nothing.
  if (finalAmount < MIN_CHARGE_POUNDS) {
    return { ok: false, reason: "That code can't be used on this booking." };
  }

  return {
    ok: true,
    code: promo.code,
    discount,
    finalAmount,
    label: describeDiscount(promo.discount_type, value),
  };
}

export type PromoInput = {
  code: string;
  description: string | null;
  discount_type: PromoDiscountType;
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  min_spend: number | null;
  is_active: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalNumber(v: unknown): number | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : 'invalid';
}

function optionalDate(v: unknown): string | null | 'invalid' {
  if (v === null || v === undefined || v === '') return null;
  return typeof v === 'string' && DATE_RE.test(v) ? v : 'invalid';
}

/** Validate an admin create/edit form. Returns the cleaned values or the first problem. */
export function parsePromoInput(
  body: Record<string, unknown>
): { ok: true; input: PromoInput } | { ok: false; error: string } {
  const code = normalizePromoCode(body.code);
  if (!PROMO_CODE_PATTERN.test(code)) {
    return { ok: false, error: 'Code must be 2-32 letters, numbers, dashes or underscores.' };
  }

  const discount_type = body.discount_type === 'fixed' ? 'fixed' : body.discount_type === 'percent' ? 'percent' : null;
  if (!discount_type) return { ok: false, error: 'Choose a percentage or a fixed amount off.' };

  const discount_value = Number(body.discount_value);
  if (!Number.isFinite(discount_value) || discount_value <= 0) {
    return { ok: false, error: 'Enter how much the code takes off.' };
  }
  if (discount_type === 'percent' && discount_value > 100) {
    return { ok: false, error: 'A percentage discount can be at most 100%.' };
  }

  const valid_from = optionalDate(body.valid_from);
  const valid_until = optionalDate(body.valid_until);
  if (valid_from === 'invalid' || valid_until === 'invalid') return { ok: false, error: 'Dates must be valid dates.' };
  if (valid_from && valid_until && valid_from > valid_until) {
    return { ok: false, error: '"Valid from" must be on or before "valid until".' };
  }

  const max_uses = optionalNumber(body.max_uses);
  if (max_uses === 'invalid' || (max_uses !== null && (!Number.isInteger(max_uses) || max_uses < 1))) {
    return { ok: false, error: 'Maximum uses must be a whole number of 1 or more, or left blank.' };
  }
  const min_spend = optionalNumber(body.min_spend);
  if (min_spend === 'invalid' || (min_spend !== null && min_spend < 0)) {
    return { ok: false, error: 'Minimum spend must be 0 or more, or left blank.' };
  }

  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 200) : null;

  return {
    ok: true,
    input: {
      code,
      description,
      discount_type,
      discount_value: roundPence(discount_value),
      valid_from,
      valid_until,
      max_uses,
      min_spend: min_spend === null ? null : roundPence(min_spend),
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
    },
  };
}
