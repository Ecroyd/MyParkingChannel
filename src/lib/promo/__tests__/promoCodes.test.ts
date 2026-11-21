import { describe, it, expect } from 'vitest';
import {
  evaluatePromoCode,
  normalizePromoCode,
  parsePromoInput,
  ukDateString,
  type PromoCode,
} from '../promoCodes';

const base: PromoCode = {
  id: 'p1',
  tenant_id: 't1',
  code: 'SUMMER10',
  description: null,
  discount_type: 'percent',
  discount_value: 10,
  valid_from: null,
  valid_until: null,
  max_uses: null,
  min_spend: null,
  times_used: 0,
  is_active: true,
};
const promo = (p: Partial<PromoCode>): PromoCode => ({ ...base, ...p });
const noon = (d: string) => new Date(`${d}T12:00:00Z`);

describe('normalizePromoCode', () => {
  it('upper-cases and strips spaces', () => {
    expect(normalizePromoCode(' summer 10 ')).toBe('SUMMER10');
    expect(normalizePromoCode(null)).toBe('');
  });
});

describe('evaluatePromoCode', () => {
  it('takes a percentage off', () => {
    expect(evaluatePromoCode(base, 80, noon('2026-11-22'))).toEqual({
      ok: true,
      code: 'SUMMER10',
      discount: 8,
      finalAmount: 72,
      label: '10% off',
    });
  });

  it('rounds to the penny', () => {
    const r = evaluatePromoCode(promo({ discount_value: 15 }), 99.99, noon('2026-11-22'));
    expect(r).toMatchObject({ ok: true, discount: 15, finalAmount: 84.99 });
  });

  it('takes a fixed amount off', () => {
    const r = evaluatePromoCode(promo({ discount_type: 'fixed', discount_value: 5 }), 49.5, noon('2026-11-22'));
    expect(r).toMatchObject({ ok: true, discount: 5, finalAmount: 44.5, label: '£5.00 off' });
  });

  it('rejects inactive or missing codes', () => {
    expect(evaluatePromoCode(promo({ is_active: false }), 50).ok).toBe(false);
    expect(evaluatePromoCode(null, 50).ok).toBe(false);
  });

  it('respects the valid date range by UK day, inclusive', () => {
    const p = promo({ valid_from: '2026-12-01', valid_until: '2026-12-31' });
    expect(evaluatePromoCode(p, 50, noon('2026-11-30'))).toEqual({ ok: false, reason: "That code isn't valid yet." });
    expect(evaluatePromoCode(p, 50, noon('2026-12-01')).ok).toBe(true);
    expect(evaluatePromoCode(p, 50, noon('2026-12-31')).ok).toBe(true);
    expect(evaluatePromoCode(p, 50, noon('2027-01-01'))).toEqual({ ok: false, reason: 'That code has expired.' });
  });

  it('uses the UK date, not UTC (BST late evening)', () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in the UK.
    expect(ukDateString(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
  });

  it('stops once the usage limit is reached', () => {
    expect(evaluatePromoCode(promo({ max_uses: 3, times_used: 2 }), 50).ok).toBe(true);
    expect(evaluatePromoCode(promo({ max_uses: 3, times_used: 3 }), 50)).toEqual({
      ok: false,
      reason: 'That code has been fully used.',
    });
  });

  it('enforces the minimum spend', () => {
    const p = promo({ min_spend: 60 });
    expect(evaluatePromoCode(p, 59.99)).toEqual({
      ok: false,
      reason: 'That code needs a booking of at least £60.00.',
    });
    expect(evaluatePromoCode(p, 60).ok).toBe(true);
  });

  it('never brings the charge below the card minimum', () => {
    expect(evaluatePromoCode(promo({ discount_value: 100 }), 50).ok).toBe(false);
    expect(evaluatePromoCode(promo({ discount_type: 'fixed', discount_value: 80 }), 50).ok).toBe(false);
    expect(evaluatePromoCode(promo({ discount_type: 'fixed', discount_value: 49.7 }), 50)).toMatchObject({
      ok: true,
      finalAmount: 0.3,
    });
  });
});

describe('parsePromoInput', () => {
  it('cleans a valid form', () => {
    const r = parsePromoInput({
      code: 'xmas 25',
      description: '  Christmas  ',
      discount_type: 'percent',
      discount_value: '25',
      valid_from: '2026-12-01',
      valid_until: '2026-12-26',
      max_uses: '100',
      min_spend: '',
    });
    expect(r).toEqual({
      ok: true,
      input: {
        code: 'XMAS25',
        description: 'Christmas',
        discount_type: 'percent',
        discount_value: 25,
        valid_from: '2026-12-01',
        valid_until: '2026-12-26',
        max_uses: 100,
        min_spend: null,
        is_active: true,
      },
    });
  });

  it('rejects bad input', () => {
    expect(parsePromoInput({ code: 'A', discount_type: 'percent', discount_value: 10 }).ok).toBe(false);
    expect(parsePromoInput({ code: 'OK10', discount_type: 'percent', discount_value: 120 }).ok).toBe(false);
    expect(parsePromoInput({ code: 'OK10', discount_type: 'fixed', discount_value: 0 }).ok).toBe(false);
    expect(parsePromoInput({ code: 'OK10', discount_type: 'other', discount_value: 5 }).ok).toBe(false);
    expect(
      parsePromoInput({ code: 'OK10', discount_type: 'fixed', discount_value: 5, valid_from: '2026-12-31', valid_until: '2026-12-01' }).ok
    ).toBe(false);
    expect(parsePromoInput({ code: 'OK10', discount_type: 'fixed', discount_value: 5, max_uses: '2.5' }).ok).toBe(false);
  });
});
