import { describe, expect, it } from 'vitest';
import { getDateRangeForQuery, tenantDateRangeUtcBounds } from '@/lib/timezone';

describe('tenantDateRangeUtcBounds', () => {
  it('uses naive UTC calendar-day bounds (matches legacy Today queries)', () => {
    const { rangeStart, rangeEnd } = tenantDateRangeUtcBounds('2026-06-25', '2026-06-25');

    expect(rangeStart).toBe('2026-06-25T00:00:00.000Z');
    expect(rangeEnd).toBe('2026-06-25T23:59:59.999Z');
  });

  it('spans multiple calendar days', () => {
    const { rangeStart, rangeEnd } = tenantDateRangeUtcBounds('2026-06-24', '2026-06-26');

    expect(rangeStart).toBe('2026-06-24T00:00:00.000Z');
    expect(rangeEnd).toBe('2026-06-26T23:59:59.999Z');
  });
});

describe('getDateRangeForQuery', () => {
  it('returns the same naive UTC bounds for Today page queries', () => {
    const { fromUTC, toUTC } = getDateRangeForQuery('2026-06-25', '2026-06-25', 'Europe/London');

    expect(fromUTC.toISOString()).toBe('2026-06-25T00:00:00.000Z');
    expect(toUTC.toISOString()).toBe('2026-06-25T23:59:59.999Z');
  });
});
