export const toMoney = (cents: number, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format((cents || 0) / 100);

/**
 * Money-bearing columns on booking rows. Keep in sync with
 * ADMIN_BOOKING_LIST_COLUMNS in lib/bookings/adminBookingListSelect.ts.
 */
const BOOKING_MONEY_FIELDS = ['money_charged', 'money_received', 'total_price'] as const;

/**
 * Nulls out monetary fields before a row reaches the client, for roles that fail
 * canViewFinancials. Conditional rendering alone is not enough: props of a client
 * component are serialised into the page payload, so an amount that is merely
 * hidden is still readable in the browser.
 */
export function redactBookingMoney<T>(row: T): T {
  const redacted: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const field of BOOKING_MONEY_FIELDS) {
    if (field in redacted) {
      redacted[field] = null;
    }
  }
  return redacted as T;
}

export function redactBookingMoneyList<T>(rows: T[]): T[] {
  return rows.map(redactBookingMoney);
}
