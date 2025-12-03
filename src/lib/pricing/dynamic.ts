/**
 * Dynamic pricing based on occupancy
 * Applies price increases when capacity thresholds are reached
 */
import { createAdminClient } from '@/lib/supabase/admin';

export type DynamicRule = {
  id: string;
  threshold_percent: number;
  price_increase_percent: number;
};

export type DynamicPricingResult = {
  finalPrice: number;
  applied: boolean;
  multiplier: number | null;
  rule: DynamicRule | null;
};

export type DynamicPricingSettings = {
  id: string;
  tenant_id: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Get tenant dynamic pricing settings and active rules
 */
export async function getTenantDynamicSettings(tenantId: string): Promise<{
  settings: DynamicPricingSettings | null;
  rules: DynamicRule[];
}> {
  const supabase = createAdminClient();

  const { data: settings, error: sErr } = await supabase
    .from('tenant_dynamic_pricing_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (sErr) {
    console.error('Error fetching dynamic pricing settings:', sErr);
    throw sErr;
  }

  if (!settings || !settings.is_enabled) {
    return { settings: null, rules: [] };
  }

  const { data: rules, error: rErr } = await supabase
    .from('tenant_dynamic_pricing_rules')
    .select('id, threshold_percent, price_increase_percent')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('threshold_percent', { ascending: false });

  if (rErr) {
    console.error('Error fetching dynamic pricing rules:', rErr);
    throw rErr;
  }

  return {
    settings,
    rules: (rules ?? []) as DynamicRule[],
  };
}

/**
 * Apply dynamic pricing to a base price based on occupancy percentage
 * Returns the adjusted price and metadata about what was applied
 */
export function applyDynamicPricingToBasePrice(
  basePrice: number,
  occupancyPercent: number,
  rules: DynamicRule[]
): DynamicPricingResult {
  if (!rules.length) {
    return {
      finalPrice: basePrice,
      applied: false,
      multiplier: null,
      rule: null,
    };
  }

  // Clamp occupancy to 0-100
  const clampedOccupancy = Math.max(0, Math.min(100, occupancyPercent));

  // Find highest threshold <= occupancy
  // Rules are sorted by threshold_percent DESC, so first match is the highest applicable threshold
  const rule = rules.find((r) => clampedOccupancy >= r.threshold_percent);

  if (!rule) {
    return {
      finalPrice: basePrice,
      applied: false,
      multiplier: null,
      rule: null,
    };
  }

  const multiplier = 1 + rule.price_increase_percent / 100;
  const finalPrice = Math.round(basePrice * multiplier * 100) / 100; // Round to 2 decimal places

  return {
    finalPrice,
    applied: true,
    multiplier,
    rule,
  };
}

/**
 * Compute occupancy percentage for a date range
 * Returns the maximum occupancy across all days in the range
 */
export async function computeOccupancyPercent(opts: {
  tenantId: string;
  startAt: string;
  endAt: string;
  excludeBookingReference?: string | null;
}): Promise<number> {
  const { tenantId, startAt, endAt, excludeBookingReference } = opts;
  const supabase = createAdminClient();

  // Generate all dates in the range
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dates: string[] = [];
  const current = new Date(start);
  
  while (current < end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  if (dates.length === 0) {
    return 0;
  }

  // Load capacity for these dates
  const { data: capRows, error: capError } = await supabase
    .from('tenant_capacity')
    .select('date, capacity')
    .eq('tenant_id', tenantId)
    .in('date', dates);

  if (capError) {
    console.error('Error fetching capacity for occupancy calculation:', capError);
    return 0;
  }

  const capByDate: Record<string, number> = {};
  (capRows ?? []).forEach((row: any) => {
    capByDate[row.date] = row.capacity || 0;
  });

  // Load bookings overlapping this period
  let bookingsQuery = supabase
    .from('bookings')
    .select('start_at, end_at, status')
    .eq('tenant_id', tenantId)
    .in('status', ['reserved', 'confirmed', 'checked_in'])
    .lt('start_at', endAt)
    .gt('end_at', startAt);

  if (excludeBookingReference) {
    bookingsQuery = bookingsQuery.neq('reference', excludeBookingReference);
  }

  const { data: bookings, error: bookingsError } = await bookingsQuery;

  if (bookingsError) {
    console.error('Error fetching bookings for occupancy calculation:', bookingsError);
    return 0;
  }

  // Calculate occupancy for each day
  let maxOccupancyPercent = 0;

  for (const dateStr of dates) {
    const capacity = capByDate[dateStr] || 0;
    
    if (capacity === 0) {
      // If capacity is 0, treat as 0% occupancy (no dynamic pricing applied)
      continue;
    }

    // Count bookings that overlap this date
    const dateStart = new Date(dateStr);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStr);
    dateEnd.setHours(23, 59, 59, 999);

    const bookingsOnDate = (bookings ?? []).filter((booking: any) => {
      const bookingStart = new Date(booking.start_at);
      const bookingEnd = new Date(booking.end_at);
      return bookingStart < dateEnd && bookingEnd > dateStart;
    });

    const booked = bookingsOnDate.length;
    const occupancyPercent = (booked / capacity) * 100;
    maxOccupancyPercent = Math.max(maxOccupancyPercent, occupancyPercent);
  }

  return Math.min(100, maxOccupancyPercent); // Clamp to 100%
}

