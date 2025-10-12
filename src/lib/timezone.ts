/**
 * Timezone utility functions for consistent date handling
 * All dates are treated as UK timezone since the platform is UK-only
 */

export function getTenantDateRange(tenantTimezone: string = 'Europe/London', date: Date = new Date()) {
  // Simple approach: get today's date in UK timezone
  const now = new Date();
  
  // Get UK date string (YYYY-MM-DD format)
  const ukDateString = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  
  // Create start and end of day in UK timezone
  const startOfDay = new Date(ukDateString + 'T00:00:00');
  const endOfDay = new Date(ukDateString + 'T23:59:59');
  
  // Convert to UTC for database queries
  const startOfDayUTC = new Date(startOfDay.getTime() - (startOfDay.getTimezoneOffset() * 60000));
  const endOfDayUTC = new Date(endOfDay.getTime() - (endOfDay.getTimezoneOffset() * 60000));
  
  return {
    startOfDay,
    endOfDay,
    startOfDayUTC,
    endOfDayUTC,
    tenantDate: new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }))
  };
}

export function getDateRangeForQuery(fromDate: string, toDate: string, tenantTimezone: string = 'Europe/London') {
  console.log("🔍 getDateRangeForQuery called with:", { fromDate, toDate, tenantTimezone });

  // Parse the plain calendar days as naive JS dates
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T23:59:59`);

  // Step A — show what JS thinks before any conversion
  console.log("🧠 Raw JS parse:", {
    start_raw: start.toISOString(),
    end_raw: end.toISOString(),
  });

  // Step B — interpret those as tenant-local times
  const startLocal = new Date(start.toLocaleString('en-US', { timeZone: tenantTimezone }));
  const endLocal = new Date(end.toLocaleString('en-US', { timeZone: tenantTimezone }));

  console.log("🌍 Interpreted as tenant-local:", {
    start_local: startLocal.toISOString(),
    end_local: endLocal.toISOString(),
  });

  // Step C — compute what you will actually return to Supabase
  const fromUTC = startLocal;
  const toUTC = endLocal;

  console.log("📦 Returned for DB query:", {
    fromUTC: fromUTC.toISOString(),
    toUTC: toUTC.toISOString(),
  });

  return {
    from: start,
    to: end,
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
