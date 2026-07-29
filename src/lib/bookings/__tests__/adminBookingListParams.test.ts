import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ALLOWED_PAGE_SIZES,
  enforceMaxPageSize,
  getDefaultAdminBookingDateWindow,
  resolveAdminBookingListParams,
  addCalendarDays,
  DEFAULT_DATE_LOOKBACK_DAYS,
  DEFAULT_DATE_LOOKAHEAD_DAYS,
} from '@/lib/bookings/adminBookingListParams';

describe('admin booking list params', () => {
  it('defaults page size to 50', () => {
    const params = resolveAdminBookingListParams({
      tenantId: 't1',
      datesCleared: true,
    });
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(params.pageSize).toBe(50);
  });

  it('enforces a maximum page size of 100', () => {
    expect(MAX_PAGE_SIZE).toBe(100);
    expect(enforceMaxPageSize(1000)).toBe(100);
    expect(enforceMaxPageSize(500)).toBe(100);
    expect(enforceMaxPageSize(101)).toBe(100);
    expect(ALLOWED_PAGE_SIZES).toEqual([25, 50, 100]);

    const params = resolveAdminBookingListParams({
      tenantId: 't1',
      pageSize: '1000',
      datesCleared: true,
    });
    expect(params.pageSize).toBe(100);
  });

  it('applies the default operational date window', () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const window = getDefaultAdminBookingDateWindow('Europe/London', now);
    // 2026-07-29 in Europe/London
    expect(window.dateFrom).toBe(addCalendarDays('2026-07-29', -DEFAULT_DATE_LOOKBACK_DAYS));
    expect(window.dateTo).toBe(addCalendarDays('2026-07-29', DEFAULT_DATE_LOOKAHEAD_DAYS));

    const params = resolveAdminBookingListParams({
      tenantId: 't1',
      timezone: 'Europe/London',
    });
    // Without frozen clock, just assert shape + flag
    expect(params.usedDefaultDateWindow).toBe(true);
    expect(params.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('allows clearing the date range while staying paginated', () => {
    const params = resolveAdminBookingListParams({
      tenantId: 't1',
      datesCleared: true,
      pageSize: 50,
    });
    expect(params.dateFrom).toBeNull();
    expect(params.dateTo).toBeNull();
    expect(params.usedDefaultDateWindow).toBe(false);
    expect(params.pageSize).toBeLessThanOrEqual(100);
  });

  it('preserves URL filter and pagination inputs', () => {
    const params = resolveAdminBookingListParams({
      tenantId: 't1',
      page: '3',
      pageSize: '25',
      search: 'ABC123',
      dateFrom: '2026-01-01',
      dateTo: '2026-06-01',
      status: 'reserved',
      source: 'cavu',
      sort: 'created_at:desc',
    });
    expect(params.page).toBe(3);
    expect(params.pageSize).toBe(25);
    expect(params.search).toBe('ABC123');
    expect(params.dateFrom).toBe('2026-01-01');
    expect(params.dateTo).toBe('2026-06-01');
    expect(params.status).toBe('reserved');
    expect(params.source).toBe('cavu');
    expect(params.sortField).toBe('created_at');
    expect(params.sortDirection).toBe('desc');
    expect(params.usedDefaultDateWindow).toBe(false);
  });
});
