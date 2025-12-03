// lib/availability/engine.ts

import { createAdminClient } from '@/lib/supabase/admin';
import { AvailabilityResponse } from '@/lib/supplier/types';

export type AvailabilityChannel = 'direct' | 'partner';

export type AvailabilityEngineInput = {
  tenantId: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  currency?: string;
  channel?: AvailabilityChannel | string; // 'direct' (default) | 'partner' | channel code (e.g. 'cavu', 'holiday_extras')
  channelCode?: string; // Explicit channel code from tenant_channels (takes precedence over channel)
  excludeReference?: string; // Skip this booking when counting usage (for amendments)
  // productId?: string; // accepted in API but not used for capacity yet
};

type CapacityRow = {
  date: string; // ISO date (YYYY-MM-DD)
  capacity: number;
  direct_reserve_mode: 'none' | 'percent' | 'fixed';
  direct_reserve_value: number;
};

type BookingRow = {
  start_at: string;
  end_at: string;
  status: string;
};

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Generate a list of dates (YYYY-MM-DD) covering the stay:
 * from floor(startAt) to floor(endAt - 1 second), inclusive.
 */
function generateStayDates(startAt: string, endAt: string): string[] {
  const start = new Date(startAt);
  const end = new Date(endAt);

  // Normalize to midnight UTC
  const startUTC = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  const dates: string[] = [];
  let cursor = startUTC.getTime();

  // We treat the stay as occupying nights; if end is same date as start, still at least 1 day
  if (endUTC.getTime() < startUTC.getTime()) {
    endUTC.setTime(startUTC.getTime());
  }

  while (cursor <= endUTC.getTime()) {
    const d = new Date(cursor);
    const isoDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
    dates.push(isoDate);
    cursor += DAY_MS;
  }

  return dates;
}

/**
 * Check if a booking overlaps a given date (YYYY-MM-DD).
 * We treat a booking as occupying all dates between floor(start_at) and floor(end_at).
 */
function bookingTouchesDate(booking: BookingRow, dateStr: string): boolean {
  const start = new Date(booking.start_at);
  const end = new Date(booking.end_at);

  const dayStart = new Date(dateStr + 'T00:00:00Z');
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  // Overlap if booking.start < dayEnd AND booking.end > dayStart
  return start < dayEnd && end > dayStart;
}

export async function calculateAvailability(
  input: AvailabilityEngineInput
): Promise<AvailabilityResponse> {
  const {
    tenantId,
    startAt,
    endAt,
    currency: inputCurrency,
    channel = 'direct',
    channelCode,
    excludeReference,
  } = input;

  // Use explicit channelCode if provided, otherwise derive from channel
  // Partner requests default to 'agent' channel if no specific channel is set
  const effectiveChannelCode = channelCode || (channel === 'partner' ? 'agent' : channel);

  const currency = inputCurrency ?? 'GBP';
  const supabase = createAdminClient();

  const stayDates = generateStayDates(startAt, endAt);
  if (stayDates.length === 0) {
    return {
      product_id: 'tenant_pool', // placeholder until we have per-product capacity
      start_at: startAt,
      end_at: endAt,
      currency,
      availability_status: 'closed',
      remaining_capacity: null,
      pricing: {
        rate_plan: 'standard',
        days: 0,
        base_price: 0,
        surcharges: [],
        discounts: [],
        total_price: 0,
      },
    };
  }

  const days = stayDates.length;

  // 1) Load tenant_capacity rows for these dates
  const { data: capRows, error: capError } = await supabase
    .from('tenant_capacity')
    .select('date, capacity, direct_reserve_mode, direct_reserve_value')
    .eq('tenant_id', tenantId)
    .in('date', stayDates);

  if (capError) {
    console.error('Availability engine: tenant_capacity error', capError);
    return {
      product_id: 'tenant_pool',
      start_at: startAt,
      end_at: endAt,
      currency,
      availability_status: 'closed',
      remaining_capacity: null,
      pricing: {
        rate_plan: 'standard',
        days,
        base_price: 0,
        surcharges: [],
        discounts: [],
        total_price: 0,
      },
    };
  }

  const capByDate: Record<string, CapacityRow> = {};
  (capRows ?? []).forEach((row: any) => {
    capByDate[row.date] = {
      date: row.date,
      capacity: row.capacity,
      direct_reserve_mode: row.direct_reserve_mode ?? 'none',
      direct_reserve_value: row.direct_reserve_value ?? 0,
    };
  });

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

  // Fill in missing capacity rows using rolling capacity logic
  for (const d of stayDates) {
    if (!capByDate[d]) {
      const dateObj = new Date(d + 'T00:00:00Z');
      
      // Check if date is within booking horizon
      if (dateObj <= horizonDate) {
        // Use default daily capacity
        capByDate[d] = {
          date: d,
          capacity: defaultDailyCapacity,
          direct_reserve_mode: 'none',
          direct_reserve_value: 0,
        };
      }
      // If date is beyond horizon, capByDate[d] remains undefined (will be treated as closed)
    }
  }

  // 2) Load all overlapping bookings for tenant across the period
  let bookingsQuery = supabase
    .from('bookings')
    .select('reference, start_at, end_at, status')
    .eq('tenant_id', tenantId)
    .in('status', ['reserved', 'confirmed', 'checked_in'])
    .lt('start_at', endAt)
    .gt('end_at', startAt);

  // Exclude the specified booking reference (for date change amendments)
  if (excludeReference) {
    bookingsQuery = bookingsQuery.neq('reference', excludeReference);
  }

  const { data: bookings, error: bookingsError } = await bookingsQuery;

  if (bookingsError) {
    console.error('Availability engine: bookings error', bookingsError);
    return {
      product_id: 'tenant_pool',
      start_at: startAt,
      end_at: endAt,
      currency,
      availability_status: 'closed',
      remaining_capacity: null,
      pricing: {
        rate_plan: 'standard',
        days,
        base_price: 0,
        surcharges: [],
        discounts: [],
        total_price: 0,
      },
    };
  }

  const usedByDate: Record<string, number> = {};
  for (const d of stayDates) {
    usedByDate[d] = 0;
  }

  (bookings ?? []).forEach((b: any) => {
    const bookingRow: BookingRow = {
      start_at: b.start_at,
      end_at: b.end_at,
      status: b.status,
    };
    for (const d of stayDates) {
      if (bookingTouchesDate(bookingRow, d)) {
        usedByDate[d] += 1;
      }
    }
  });

  let overallRemaining: number | null = null;
  let availability_status: 'available' | 'sold_out' | 'closed' = 'available';

  for (const d of stayDates) {
    const capRow = capByDate[d];

    // If no capacity row (beyond booking horizon or explicitly closed), this day is closed
    if (!capRow) {
      availability_status = 'closed';
      overallRemaining = null;
      break;
    }

    // If capacity is zero or negative, this day is closed
    if (capRow.capacity <= 0) {
      availability_status = 'closed';
      overallRemaining = null;
      break;
    }

    const totalCapacity = capRow.capacity;

    // Compute reserved share for direct
    let reservedForDirect = 0;
    if (capRow.direct_reserve_mode === 'percent') {
      reservedForDirect = Math.floor(
        (totalCapacity * capRow.direct_reserve_value) / 100
      );
    } else if (capRow.direct_reserve_mode === 'fixed') {
      reservedForDirect = capRow.direct_reserve_value;
    }

    if (reservedForDirect < 0) reservedForDirect = 0;
    if (reservedForDirect > totalCapacity) reservedForDirect = totalCapacity;

    const effectiveCapacity =
      channel === 'partner'
        ? Math.max(0, totalCapacity - reservedForDirect)
        : totalCapacity;

    const usedSpaces = usedByDate[d] ?? 0;
    const remaining = effectiveCapacity - usedSpaces;

    if (effectiveCapacity === 0) {
      availability_status = 'closed';
      overallRemaining = null;
      break;
    }

    if (remaining <= 0) {
      availability_status = 'sold_out';
      overallRemaining =
        overallRemaining === null ? 0 : Math.min(overallRemaining, 0);
    } else {
      overallRemaining =
        overallRemaining === null
          ? remaining
          : Math.min(overallRemaining, remaining);
    }
  }

  if (availability_status === 'available' && (overallRemaining ?? 0) <= 0) {
    availability_status = 'sold_out';
  }

  // Try to get channel-specific pricing using LOS matrix
  // First, try to find season for the stay dates
  let seasonId: string | null = null;
  const firstDate = stayDates[0];

  // Find season that covers these dates
  const { data: seasonRanges } = await supabase
    .from('season_ranges')
    .select('season_id, range')
    .eq('tenant_id', tenantId)
    .limit(100); // Get all ranges for tenant

  if (seasonRanges && seasonRanges.length > 0) {
    // Check if any season range covers our dates
    for (const sr of seasonRanges) {
      const rangeStr = sr.range as string;
      // Parse daterange format [start,end)
      const match = rangeStr.match(/^[\[\(]([^,]+),([^,\)]+)[\)\]]$/);
      if (match) {
        const rangeStart = match[1];
        const rangeEnd = match[2];
        if (firstDate >= rangeStart && firstDate < rangeEnd) {
          seasonId = sr.season_id;
          break;
        }
      }
    }
  }

  // Try to get LOS pricing for this channel with fallback chain:
  // 1. Try specific channel (e.g., 'cavu')
  // 2. Fallback to 'agent' channel
  // 3. Fallback to 'all' channel
  // 4. Final fallback to tenant_pricing (never free)
  let base_price = 0;
  let currencyFromPricing = currency;
  
  try {
    const { getPriceForStay } = await import('@/lib/pricing/channel');
    
    // Try specific channel first
    let losPrice = await getPriceForStay({
      tenantId,
      seasonId,
      ratePlanId: null,
      channelCode: effectiveChannelCode,
      days,
    });

    // If not found and not already 'agent', try 'agent' channel
    if (losPrice === null && effectiveChannelCode !== 'agent') {
      losPrice = await getPriceForStay({
        tenantId,
        seasonId,
        ratePlanId: null,
        channelCode: 'agent',
        days,
      });
    }

    // If still not found, try 'all' channel
    if (losPrice === null && effectiveChannelCode !== 'all') {
      losPrice = await getPriceForStay({
        tenantId,
        seasonId,
        ratePlanId: null,
        channelCode: 'all',
        days,
      });
    }

    if (losPrice !== null && losPrice > 0) {
      base_price = losPrice;
    } else {
      // Final fallback to tenant_pricing (ensures pricing is never free)
      const { data: pricing } = await supabase
        .from('tenant_pricing')
        .select('daily_rate, currency')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const basePricePerDay: number = Number(pricing?.daily_rate ?? 10);
      base_price = basePricePerDay * days;
      currencyFromPricing = pricing?.currency || currency;
    }
  } catch (error) {
    console.error('Error getting channel-specific pricing, falling back to tenant_pricing:', error);
    // Fallback to tenant_pricing (ensures pricing is never free)
    const { data: pricing } = await supabase
      .from('tenant_pricing')
      .select('daily_rate, currency')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const basePricePerDay: number = Number(pricing?.daily_rate ?? 10);
    base_price = basePricePerDay * days;
    currencyFromPricing = pricing?.currency || currency;
  }

  // Ensure pricing is never zero/free
  if (base_price <= 0) {
    base_price = 10 * days; // Minimum £10 per day fallback
  }

  // Ensure pricing is never zero/free (final safety check)
  if (base_price <= 0) {
    base_price = 10 * days; // Minimum £10 per day fallback
  }

  // Apply dynamic pricing based on occupancy
  let final_price = base_price;
  let dynamicPricingApplied = false;
  let dynamicPricingMultiplier: number | null = null;
  let dynamicPricingRuleId: string | null = null;
  let dynamicPricingOccupancyPercent: number | null = null;

  try {
    const {
      getTenantDynamicSettings,
      applyDynamicPricingToBasePrice,
      computeOccupancyPercent,
    } = await import('@/lib/pricing/dynamic');

    const { settings, rules } = await getTenantDynamicSettings(tenantId);

    if (settings && rules.length > 0) {
      const occupancyPercent = await computeOccupancyPercent({
        tenantId,
        startAt,
        endAt,
        excludeBookingReference: excludeReference || null,
      });

      dynamicPricingOccupancyPercent = occupancyPercent;

      const dynamic = applyDynamicPricingToBasePrice(base_price, occupancyPercent, rules);

      if (dynamic.applied) {
        final_price = dynamic.finalPrice;
        dynamicPricingApplied = true;
        dynamicPricingMultiplier = dynamic.multiplier;
        dynamicPricingRuleId = dynamic.rule?.id || null;
      }
    }
  } catch (error) {
    console.error('Error applying dynamic pricing, using base price:', error);
    // Continue with base price if dynamic pricing fails
  }

  const surcharges: { code: string; description?: string; amount: number }[] = [];
  const discounts: { code: string; description?: string; amount: number }[] = [];
  
  // Add dynamic pricing as a surcharge if applied
  if (dynamicPricingApplied && dynamicPricingMultiplier) {
    const dynamicIncrease = final_price - base_price;
    surcharges.push({
      code: 'dynamic_pricing',
      description: `Dynamic pricing (occupancy ${dynamicPricingOccupancyPercent?.toFixed(1)}%)`,
      amount: dynamicIncrease,
    });
  }

  const total_price = final_price;

  return {
    product_id: 'tenant_pool', // placeholder; capacity is per-tenant for now
    start_at: startAt,
    end_at: endAt,
    currency: currencyFromPricing,
    availability_status,
    remaining_capacity: overallRemaining,
    pricing: {
      rate_plan: 'standard',
      days,
      base_price,
      surcharges,
      discounts,
      total_price,
      // Dynamic pricing metadata
      dynamicPricingApplied,
      dynamicPricingMultiplier,
      dynamicPricingRuleId,
      dynamicPricingOccupancyPercent,
    },
  };
}
