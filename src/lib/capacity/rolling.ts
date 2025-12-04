// Helper function to calculate capacity by date using rolling capacity logic

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Calculate capacity for a date range using rolling capacity logic
 * @param tenantId - The tenant ID
 * @param dates - Array of date strings (YYYY-MM-DD)
 * @returns Record mapping date strings to capacity numbers (or null if closed)
 */
export async function calculateCapacityByDate(
  tenantId: string,
  dates: string[]
): Promise<Record<string, number | null>> {
  const supabase = createAdminClient();

  // Load tenant_capacity rows for these dates
  const { data: capRows } = await supabase
    .from('tenant_capacity')
    .select('date, capacity')
    .eq('tenant_id', tenantId)
    .in('date', dates);

  // Load tenant_settings for rolling capacity defaults
  const { data: tenantSettings } = await supabase
    .from('tenant_settings')
    .select('rolling_capacity_months, default_daily_capacity')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const rollingMonths = tenantSettings?.rolling_capacity_months ?? 12;
  const defaultDailyCapacity = tenantSettings?.default_daily_capacity ?? 250;

  // Calculate the booking horizon date (today + rolling months)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizonDate = new Date(today);
  horizonDate.setUTCMonth(horizonDate.getUTCMonth() + rollingMonths);

  const capacityByDate: Record<string, number | null> = {};
  const tenantCapByDate: Record<string, number> = {};

  // Map existing capacity overrides
  (capRows ?? []).forEach((row: any) => {
    tenantCapByDate[row.date] = row.capacity;
  });

  // Calculate capacity for each date
  for (const dateStr of dates) {
    // If there's an explicit override, use it
    if (tenantCapByDate[dateStr] !== undefined) {
      capacityByDate[dateStr] = tenantCapByDate[dateStr];
    } else {
      // Otherwise, use rolling capacity logic
      const dateObj = new Date(dateStr + 'T00:00:00Z');
      if (dateObj <= horizonDate) {
        capacityByDate[dateStr] = defaultDailyCapacity;
      } else {
        capacityByDate[dateStr] = null; // Closed beyond horizon
      }
    }
  }

  return capacityByDate;
}

/**
 * Calculate capacity for a single date using rolling capacity logic
 * @param tenantId - The tenant ID
 * @param dateStr - Date string (YYYY-MM-DD)
 * @returns Capacity number or null if closed
 */
export async function calculateCapacityForDate(
  tenantId: string,
  dateStr: string
): Promise<number | null> {
  const capacities = await calculateCapacityByDate(tenantId, [dateStr]);
  return capacities[dateStr] ?? null;
}

