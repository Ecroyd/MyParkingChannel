import { describe, it, expect } from 'vitest';
import {
  addPenceToPounds,
  buildManageBookingReturnUrl,
  classifyDateChange,
  platformFeeCents,
  priceDifferenceCents,
  resolveExtendedEndAt,
  sameMinute,
} from './stayChange';

const START = '2026-11-01T08:00:00.000Z';
const END = '2026-11-08T18:00:00.000Z';

describe('sameMinute', () => {
  it('ignores seconds', () => {
    expect(sameMinute('2026-11-01T08:00:42.123Z', '2026-11-01T08:00:00.000Z')).toBe(true);
    expect(sameMinute('2026-11-01T08:01:00Z', '2026-11-01T08:00:00Z')).toBe(false);
    expect(sameMinute('nope', 'nope')).toBe(false);
  });
});

describe('priceDifferenceCents / platformFeeCents', () => {
  it('works in whole pence', () => {
    expect(priceDifferenceCents(49.99, 64.99)).toBe(1500);
    expect(priceDifferenceCents(50, 40)).toBe(-1000);
  });
  it('fee is 10% rounded, never negative', () => {
    expect(platformFeeCents(1555)).toBe(156);
    expect(platformFeeCents(-100)).toBe(0);
  });
});

describe('classifyDateChange', () => {
  it('treats re-sent current dates as unchanged', () => {
    expect(classifyDateChange({ currentStartAt: START, currentEndAt: END, newStartAt: START, newEndAt: END }).kind).toBe('unchanged');
  });
  it('rejects end before start and garbage', () => {
    expect(classifyDateChange({ currentStartAt: START, currentEndAt: END, newStartAt: END, newEndAt: START }).kind).toBe('invalid');
    expect(classifyDateChange({ currentStartAt: START, currentEndAt: END, newStartAt: 'x', newEndAt: END }).kind).toBe('invalid');
  });
  it('asks for a quote when dates change and no prices given', () => {
    expect(classifyDateChange({ currentStartAt: START, currentEndAt: END, newStartAt: START, newEndAt: '2026-11-10T18:00:00Z' }).kind).toBe('needs_quote');
  });
  it('free when new price is equal or lower, payment when higher', () => {
    const base = { currentStartAt: START, currentEndAt: END, newStartAt: '2026-11-02T08:00:00Z', newEndAt: '2026-11-09T18:00:00Z' };
    expect(classifyDateChange({ ...base, oldPriceCents: 5000, newPriceCents: 5000 }).kind).toBe('free');
    expect(classifyDateChange({ ...base, oldPriceCents: 5000, newPriceCents: 4000 }).kind).toBe('free');
    expect(classifyDateChange({ ...base, oldPriceCents: 5000, newPriceCents: 6500 })).toEqual({ kind: 'needs_payment', differenceCents: 1500 });
  });
});

describe('resolveExtendedEndAt', () => {
  it('moves the end later', () => {
    expect(resolveExtendedEndAt(END, '2026-11-10T18:00:00Z')).toBe('2026-11-10T18:00:00.000Z');
  });
  it('never moves the end earlier (out-of-order or repeat payments)', () => {
    expect(resolveExtendedEndAt('2026-11-12T18:00:00Z', '2026-11-10T18:00:00Z')).toBe('2026-11-12T18:00:00Z');
    expect(resolveExtendedEndAt(END, 'bad')).toBe(END);
  });
});

describe('addPenceToPounds', () => {
  it('adds without float drift and handles null/strings', () => {
    expect(addPenceToPounds(0.1, 20)).toBe(0.3);
    expect(addPenceToPounds(null, 1500)).toBe(15);
    expect(addPenceToPounds('49.99', 1001)).toBe(60);
  });
});

describe('buildManageBookingReturnUrl', () => {
  const fallbackUrl = 'https://acme.myparkingchannel.app/manage-booking';
  it('returns to the custom domain the customer came from', () => {
    expect(
      buildManageBookingReturnUrl({
        origin: 'https://parkingexeterairport.co.uk',
        referer: 'https://parkingexeterairport.co.uk/manage-booking',
        fallbackUrl,
        query: 'extended=1',
      })
    ).toBe('https://parkingexeterairport.co.uk/manage-booking?extended=1');
  });
  it('keeps a /sites/<slug>/manage-booking path from a same-origin referer', () => {
    expect(
      buildManageBookingReturnUrl({
        origin: 'http://localhost:3000',
        referer: 'http://localhost:3000/sites/acme/manage-booking?x=1',
        fallbackUrl,
        query: 'extended=1',
      })
    ).toBe('http://localhost:3000/sites/acme/manage-booking?extended=1');
  });
  it('ignores cross-origin referers and bad origins', () => {
    expect(
      buildManageBookingReturnUrl({ origin: 'https://a.example', referer: 'https://evil.example/manage-booking', fallbackUrl, query: 'q=1' })
    ).toBe('https://a.example/manage-booking?q=1');
    expect(buildManageBookingReturnUrl({ origin: 'javascript:alert(1)', referer: null, fallbackUrl, query: 'q=1' })).toBe(
      'https://acme.myparkingchannel.app/manage-booking?q=1'
    );
    expect(buildManageBookingReturnUrl({ origin: null, referer: null, fallbackUrl, query: 'q=1' })).toBe(
      'https://acme.myparkingchannel.app/manage-booking?q=1'
    );
  });
});
