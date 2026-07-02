/**
 * Timezone utility functions for consistent date handling
 * All dates are treated as UK timezone since the platform is UK-only
 */

/**
 * UTC bounds for a tenant calendar date (YYYY-MM-DD).
 *
 * Booking imports historically store supplier UK local clock times as UTC
 * (e.g. 14:00 UK → start_at 14:00Z). Today-page range queries must use these
 * naive calendar-day UTC bounds, not zonedTimeToUtc, or arrivals/departures
 * disappear for most rows.
 */
export function tenantDateRangeUtcBounds(fromDate: string, toDate: string) {
  return {
    rangeStart: `${fromDate}T00:00:00.000Z`,
    rangeEnd: `${toDate}T23:59:59.999Z`,
    /** Use .lt(column, rangeEnd) on start_at / end_at — matches legacy Today page. */
    endExclusive: true as const,
  };
}

export function tenantTodayDateKey(timezone: string = 'Europe/London', date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone });
}

export function getTenantDateRange(tenantTimezone: string = 'Europe/London', date: Date = new Date()) {
  const dateKey = tenantTodayDateKey(tenantTimezone, date);
  const { rangeStart, rangeEnd } = tenantDateRangeUtcBounds(dateKey, dateKey);
  const startOfDayUTC = new Date(rangeStart);
  const endOfDayUTC = new Date(rangeEnd);

  return {
    startOfDay: new Date(`${dateKey}T00:00:00`),
    endOfDay: new Date(`${dateKey}T23:59:59`),
    startOfDayUTC,
    endOfDayUTC,
    tenantDate: dateKey,
  };
}

export function getDateRangeForQuery(fromDate: string, toDate: string, tenantTimezone: string = 'Europe/London') {
  // Today ops board: same naive UTC calendar bounds as getTenantDateRange.
  const { rangeStart, rangeEnd } = tenantDateRangeUtcBounds(fromDate, toDate);
  const fromUTC = new Date(rangeStart);
  const toUTC = new Date(rangeEnd);

  return {
    from: new Date(`${fromDate}T00:00:00`),
    to: new Date(`${toDate}T23:59:59`),
    fromUTC,
    toUTC,
  };
}


export function formatDateForDisplay(date: string, tenantTimezone: string = 'Europe/London'): string {
  const utcDate = new Date(date);
  return utcDate.toLocaleString('en-GB', {
    timeZone: tenantTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
