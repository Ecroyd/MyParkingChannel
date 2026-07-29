import { describe, it, expect } from 'vitest';
import {
  ADMIN_BOOKING_LIST_COLUMNS,
  ADMIN_BOOKING_LIST_SELECT,
  assertAdminBookingListSelectSafe,
} from '@/lib/bookings/adminBookingListSelect';

describe('ADMIN_BOOKING_LIST_SELECT', () => {
  it('never uses select("*")', () => {
    expect(ADMIN_BOOKING_LIST_SELECT).not.toBe('*');
    expect(ADMIN_BOOKING_LIST_SELECT.includes('*')).toBe(false);
    expect(() => assertAdminBookingListSelectSafe()).not.toThrow();
  });

  it('fails the static assertion if selection is changed back to *', () => {
    expect(() => assertAdminBookingListSelectSafe('*')).toThrow(/must not use select/);
    expect(() => assertAdminBookingListSelectSafe('id, *')).toThrow(/must not use select/);
  });

  it('returned rows contain only approved list fields', () => {
    const approved = new Set<string>(ADMIN_BOOKING_LIST_COLUMNS);
    for (const col of ADMIN_BOOKING_LIST_SELECT.split(',').map((c) => c.trim())) {
      expect(approved.has(col)).toBe(true);
    }
    // Explicitly excluded large / unused list fields
    expect(approved.has('notes')).toBe(false);
    expect(approved.has('dedupe_key')).toBe(false);
    expect(approved.has('dynamic_pricing_note')).toBe(false);
    expect(approved.has('ops_hidden_reason')).toBe(false);
  });

  it('includes fields rendered by the list UI', () => {
    expect(ADMIN_BOOKING_LIST_COLUMNS).toContain('customer_email');
    expect(ADMIN_BOOKING_LIST_COLUMNS).toContain('dynamic_pricing_applied');
    expect(ADMIN_BOOKING_LIST_COLUMNS).toContain('highlight_code');
    expect(ADMIN_BOOKING_LIST_COLUMNS).toContain('is_incomplete');
  });
});
