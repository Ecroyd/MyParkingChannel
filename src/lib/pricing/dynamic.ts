/**
 * Dynamic pricing based on occupancy
 * Applies price increases when capacity thresholds are reached
 */
import { createAdminClient } from '@/lib/supabase/admin';
import {
  aggregateDemandByDay,
  enumerateDateKeys,
  loadDemandBookingsForWindow,
  maxBookedDemandOccupancyPercent,
} from '@/lib/analytics/demandOccupancy';
import { DEFAULT_TENANT_TIMEZONE, tenantDateKeyFromUtc } from '@/lib/datetime/parse';

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
 * Compute occupancy percentage for a date range using booked demand (spaces sold).
 * Returns the maximum bookedDemand / capacity across all tenant-local days in the range.
 */
export async function computeOccupancyPercent(opts: {
  tenantId: string;
  startAt: string;
  endAt: string;
  excludeBookingReference?: string | null;
  timezone?: string;
}): Promise<number> {
  const { tenantId, startAt, endAt, excludeBookingReference } = opts;
  const supabase = createAdminClient();

  let timezone = opts.timezone ?? DEFAULT_TENANT_TIMEZONE;
  if (!opts.timezone) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('timezone')
      .eq('id', tenantId)
      .maybeSingle();
    timezone = tenant?.timezone || DEFAULT_TENANT_TIMEZONE;
  }

  const fromDay = tenantDateKeyFromUtc(startAt, timezone);
  const toDay = tenantDateKeyFromUtc(endAt, timezone);
  if (!fromDay || !toDay) return 0;

  const dayKeys = enumerateDateKeys(fromDay, toDay);
  if (dayKeys.length === 0) return 0;

  const { data: capRows, error: capError } = await supabase
    .from('tenant_capacity')
    .select('date, capacity')
    .eq('tenant_id', tenantId)
    .in('date', dayKeys);

  if (capError) {
    console.error('Error fetching capacity for occupancy calculation:', capError);
    return 0;
  }

  const capacityByDate: Record<string, number | null> = {};
  (capRows ?? []).forEach((row: { date: string; capacity: number }) => {
    capacityByDate[row.date] = row.capacity ?? 0;
  });

  const bookings = await loadDemandBookingsForWindow({
    tenantId,
    from: fromDay,
    to: toDay,
    timezone,
    excludeBookingReference,
  });

  const days = aggregateDemandByDay({
    bookings,
    dayKeys,
    timezone,
    capacityByDate,
  });

  return maxBookedDemandOccupancyPercent(days);
}

