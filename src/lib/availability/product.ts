// src/lib/availability/product.ts

// Product-based availability + pricing for supplier API

// Source of truth: seasons + LOS matrix in pricing_rules + price_tiers

// Dynamic pricing: tenant_dynamic_pricing_settings + tenant_dynamic_pricing_rules

import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getMatrixPriceForStay, type PricingSource, findSeasonForDate } from '@/lib/pricing/matrix';

const DAY_MS = 1000 * 60 * 60 * 24;

export type AvailabilityResult = {
  productId: string;
  startAt: string;
  endAt: string;
  currency: string;
  availabilityStatus: 'available' | 'sold_out' | 'closed';
  remainingCapacity: number | null;
  pricing: {
    ratePlanId: string;
    ratePlanName: string;
    days: number;
    basePrice: number; // total price from matrix BEFORE dynamic pricing
    surcharges: {
      type: string;
      label?: string;
      amount: number;
      meta?: Record<string, any>;
    }[];
    discounts: {
      type: string;
      label?: string;
      amount: number;
      meta?: Record<string, any>;
    }[];
    totalPrice: number; // final price after surcharges/discounts
    dynamicPricingApplied?: boolean;
    _pricingSource?: PricingSource; // internal debug only
  };
};

type AvailabilityInput = {
  tenantId: string;
  productId?: string; // Optional - defaults to "Standard Parking"
  startAt: string;
  endAt: string;
  currency?: string;
  channelCode?: string; // Channel code for pricing (e.g. 'agent', 'cavu', 'holiday_extras')
  excludeBookingReference?: string; // For date change amendments
};

// PricingSource type is now imported from @/lib/pricing/matrix

/**
 * Generate a list of dates (YYYY-MM-DD) covering the stay (inclusive)
 */
function generateStayDates(startAt: string, endAt: string): string[] {
  const start = new Date(startAt);
  const end = new Date(endAt);

  // Normalise both to UTC midnight
  const startUTC = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  const dates: string[] = [];
  let cursor = startUTC.getTime();

  // Guard: if end is before start, clamp to start
  if (endUTC.getTime() < startUTC.getTime()) {
    endUTC.setTime(startUTC.getTime());
  }

  while (cursor <= endUTC.getTime()) {
    const d = new Date(cursor);
    dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    cursor += DAY_MS;
  }

  return dates;
}

/**
 * Check if a booking overlaps a given date
 */
function bookingTouchesDate(booking: { start_at: string; end_at: string }, dateStr: string): boolean {
  const start = new Date(booking.start_at);
  const end = new Date(booking.end_at);
  const dayStart = new Date(dateStr + 'T00:00:00Z');
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  return start < dayEnd && end > dayStart;
}

/**
 * Check if a booking overlaps with a time range, accounting for a 1-hour buffer after the booking ends.
 * A booking occupies space from start_at to (end_at + 1 hour).
 */
function bookingOverlapsTimeRange(
  booking: { start_at: string; end_at: string },
  checkStartAt: string,
  checkEndAt: string
): boolean {
  const bookingStart = new Date(booking.start_at);
  const bookingEnd = new Date(booking.end_at);
  const checkStart = new Date(checkStartAt);
  const checkEnd = new Date(checkEndAt);

  // Booking occupies space until 1 hour after end time
  const bookingEndWithBuffer = new Date(bookingEnd.getTime() + 60 * 60 * 1000); // +1 hour

  // Overlap if: checkStart < bookingEndWithBuffer AND checkEnd > bookingStart
  return checkStart < bookingEndWithBuffer && checkEnd > bookingStart;
}

/**
 * Alias for findSeasonForDate to match the naming convention used in the new pricing function
 */
async function findSeasonForDateRange(
  supabase: SupabaseClient,
  tenantId: string,
  firstDate: string
): Promise<string | null> {
  return findSeasonForDate(supabase, tenantId, firstDate);
}

/**
 * Load a single LOS (length-of-stay) pricing rule for EXACT `days`
 * and return the rule plus its price_tier value.
 *
 * We assume:
 * - min_stay = days
 * - max_stay is either days or null (null = open-ended from that LOS upwards)
 */
async function loadLosRuleForDays(params: {
  supabase: SupabaseClient;
  tenantId: string;
  seasonId: string | null;
  ratePlanId: string | null;
  channelCode: string; // e.g. 'agent' or 'web'
  days: number;
}): Promise<{
  rule: any;
  tierValue: number;
  tierType: string;
}> {
  const { supabase, tenantId, seasonId, ratePlanId, channelCode, days } = params;

  // Base query: exact min_stay = days
  let query = supabase
    .from('pricing_rules')
    .select(`
      id,
      tenant_id,
      rate_plan_id,
      season_id,
      tier_id,
      channel,
      min_stay,
      max_stay,
      priority,
      is_active,
      created_at
    `)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('min_stay', days);

  // Scope by season
  if (seasonId) {
    query = query.eq('season_id', seasonId);
  } else {
    query = query.is('season_id', null);
  }

  // Scope by rate plan
  if (ratePlanId) {
    query = query.eq('rate_plan_id', ratePlanId);
  } else {
    query = query.is('rate_plan_id', null);
  }

  const { data: allRules, error } = await query;

  if (error) {
    console.error('[PRICING] loadLosRuleForDays error:', error);
    throw new Error(`Failed to query pricing_rules for ${days} days: ${error.message || JSON.stringify(error)}`);
  }

  if (!allRules || allRules.length === 0) {
    throw new Error(`No LOS pricing rule found for ${days} days`);
  }

  // Filter to rules whose channel matches precedence
  const channelMatches = allRules.filter((r) => r.channel === channelCode);
  const agentMatches = allRules.filter((r) => r.channel === 'agent');
  const allMatches = allRules.filter((r) => r.channel === 'all');
  const nullMatches = allRules.filter((r) => !r.channel);

  // Use the first non-empty bucket by precedence
  let candidates =
    channelMatches.length > 0
      ? channelMatches
      : agentMatches.length > 0
      ? agentMatches
      : allMatches.length > 0
      ? allMatches
      : nullMatches;

  if (!candidates || candidates.length === 0) {
    throw new Error(`No LOS pricing rule found for ${days} days after channel precedence`);
  }

  // Sort by priority (lowest first) then created_at (oldest first)
  candidates.sort((a, b) => {
    const pa = a.priority ?? 100;
    const pb = b.priority ?? 100;
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const selectedRule = candidates[0];

  // Load the tier for this rule
  const { data: tier, error: tierError } = await supabase
    .from('price_tiers')
    .select('id, type, value, code, label')
    .eq('id', selectedRule.tier_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (tierError || !tier) {
    console.error('[PRICING] loadLosRuleForDays tier error:', tierError);
    throw new Error(`Failed to load price_tier for rule ${selectedRule.id}`);
  }

  const tierValue = Number(tier.value);
  if (Number.isNaN(tierValue) || tierValue < 0) {
    throw new Error(`Invalid tier value for rule ${selectedRule.id}: ${tier.value}`);
  }

  return {
    rule: selectedRule,
    tierValue,
    tierType: tier.type,
  };
}

/**
 * Get total price for stay from pricing tables (LOS matrix model).
 *
 * Rules:
 * - "days" = number of calendar dates touched by the stay (inclusive).
 * - LOS matrix has explicit prices for 1–30 days.
 * - For >30 days, we use:
 *     price_for_30_days + (days - 30) * extra_day_price
 *   where:
 *     - price_for_30_days comes from LOS = 30 row
 *     - extra_day_price comes from a special LOS = 31 row
 */
async function getProductPricingForStay(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    productId: string;
    startAt: string;
    endAt: string;
    currency: string;
    channelCode?: string;
    days: number;
  }
): Promise<{ ratePlanName: string; totalPrice: number; pricePerDay: number; source: PricingSource }> {
  const { tenantId, productId, startAt, endAt, currency, channelCode, days } = params;

  const stayDates = generateStayDates(startAt, endAt);
  const actualDays = stayDates.length;

  if (actualDays <= 0) {
    throw new Error('Stay must cover at least one day');
  }

  // We trust the days passed in from caller, but we sanity check
  let losDays = days;
  if (losDays !== actualDays) {
    // If they ever drift, we force LOS to be based on dates
    losDays = actualDays;
  }

  const firstDate = stayDates[0];

  // Default channel code
  const effectiveChannelCode = channelCode || 'agent';

  // 1) Find the season that covers the arrival date
  const seasonId = await findSeasonForDateRange(supabase, tenantId, firstDate);

  // 2) Get rate plan info (for metadata only)
  let ratePlanId: string | null = null;
  let ratePlanName = 'Standard Rate';

  const { data: ratePlan } = await supabase
    .from('product_rate_plans')
    .select('id, name')
    .eq('product_id', productId)
    .limit(1)
    .maybeSingle();

  if (ratePlan) {
    ratePlanId = ratePlan.id;
    ratePlanName = ratePlan.name || 'Standard Rate';
  }

  // 3) Load LOS pricing according to matrix rules

  // A) For LOS 1–30: direct lookup in matrix (exact LOS)
  if (losDays >= 1 && losDays <= 30) {
    const { rule, tierValue, tierType } = await loadLosRuleForDays({
      supabase,
      tenantId,
      seasonId,
      ratePlanId,
      channelCode: effectiveChannelCode,
      days: losDays,
    });

    // For matrix entries, tierValue is TOTAL price for the whole stay
    const totalPrice = tierValue;
    if (Number.isNaN(totalPrice) || totalPrice <= 0) {
      throw new Error(`Invalid total price for ${losDays} days (rule ${rule.id})`);
    }

    const pricePerDay = totalPrice / losDays;

    return {
      ratePlanName,
      totalPrice,
      pricePerDay,
      source: {
        table: 'pricing_rules',
        ratePlanId: rule.rate_plan_id,
        ratePlanName,
        totalPrice,
        pricePerDay,
        seasonId: rule.season_id,
        channelCode: rule.channel || effectiveChannelCode,
        pricingRuleId: rule.id,
        tierId: rule.tier_id,
        tierType,
        tierValue,
        days: losDays,
      },
    };
  }

  // B) For LOS > 30:
  //    total = price_for_30_days + (days - 30) * extra_day_price
  //    where:
  //      - LOS = 30 row is the 30-day matrix price
  //      - LOS = 31 row's tierValue is "extra_day_price" (per extra day)
  if (losDays > 30) {
    // Get 30-day LOS price
    const { rule: rule30, tierValue: priceFor30, tierType: tierType30 } = await loadLosRuleForDays({
      supabase,
      tenantId,
      seasonId,
      ratePlanId,
      channelCode: effectiveChannelCode,
      days: 30,
    });

    if (Number.isNaN(priceFor30) || priceFor30 <= 0) {
      throw new Error(`Invalid 30-day matrix price (rule ${rule30.id})`);
    }

    // Get extra-day price from LOS = 31 row
    const { rule: extraRule, tierValue: extraDayPrice, tierType: extraTierType } = await loadLosRuleForDays({
      supabase,
      tenantId,
      seasonId,
      ratePlanId,
      channelCode: effectiveChannelCode,
      days: 31,
    });

    if (Number.isNaN(extraDayPrice) || extraDayPrice < 0) {
      throw new Error(`Invalid extra-day price (LOS=31, rule ${extraRule.id})`);
    }

    const extraDays = losDays - 30;
    const totalPrice = priceFor30 + extraDays * extraDayPrice;

    if (Number.isNaN(totalPrice) || totalPrice <= 0) {
      throw new Error(`Invalid total price for ${losDays} days (30-day+extra-day calculation)`);
    }

    const pricePerDay = totalPrice / losDays;

    return {
      ratePlanName,
      totalPrice,
      pricePerDay,
      source: {
        table: 'pricing_rules',
        ratePlanId: rule30.rate_plan_id,
        ratePlanName,
        totalPrice,
        pricePerDay,
        seasonId: rule30.season_id,
        channelCode: rule30.channel || effectiveChannelCode,
        pricingRuleId: rule30.id, // main LOS anchor
        tierId: rule30.tier_id,
        tierType: `${tierType30} + extra(${extraTierType})`,
        tierValue: priceFor30,
        days: losDays,
      },
    };
  }

  // Just in case something weird happens
  throw new Error(`Unsupported LOS days value: ${losDays}`);
}

/**
 * Apply dynamic pricing (if enabled) based on occupancy percentage.
 * Returns { increaseAmount, appliedRule }.
 */
async function applyDynamicPricing(params: {
  supabase: SupabaseClient;
  tenantId: string;
  baseTotal: number;
  occupancyPercent: number;
}): Promise<{ increaseAmount: number; appliedRule: any | null }> {
  const { supabase, tenantId, baseTotal, occupancyPercent } = params;

  const { data: settings, error: settingsError } = await supabase
    .from('tenant_dynamic_pricing_settings')
    .select('id, is_enabled, scope')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (settingsError || !settings || !settings.is_enabled) {
    return { increaseAmount: 0, appliedRule: null };
  }

  const { data: rules, error: rulesError } = await supabase
    .from('tenant_dynamic_pricing_rules')
    .select('id, threshold_percent, price_increase_percent, sort_order, is_active')
    .eq('tenant_id', tenantId)
    .eq('settings_id', settings.id)
    .eq('is_active', true)
    .order('threshold_percent', { ascending: true });

  if (rulesError || !rules || rules.length === 0) {
    return { increaseAmount: 0, appliedRule: null };
  }

  // Find the highest threshold <= occupancyPercent
  const eligible = rules.filter((r: any) => Number(r.threshold_percent) <= occupancyPercent);
  if (eligible.length === 0) {
    return { increaseAmount: 0, appliedRule: null };
  }

  const appliedRule = eligible[eligible.length - 1];
  const increasePercent = Number(appliedRule.price_increase_percent) || 0;
  if (increasePercent <= 0) {
    return { increaseAmount: 0, appliedRule: null };
  }

  const increaseAmount = (baseTotal * increasePercent) / 100;
  return { increaseAmount, appliedRule };
}

/**
 * Calculate availability for a product using tenant capacity + LOS matrix + dynamic pricing.
 */
export async function calculateProductAvailability(input: AvailabilityInput): Promise<AvailabilityResult> {
  const {
    tenantId,
    productId: inputProductId,
    startAt,
    endAt,
    currency: inputCurrency,
    channelCode,
    excludeBookingReference,
  } = input;

  const supabase = createAdminClient();
  const currency = inputCurrency ?? 'GBP';

  // 1) Resolve product (prefer code='STANDARD', fallback to first active product)
  let productId: string | null = null;
  let product: any;

  if (inputProductId) {
    const { data: p, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', inputProductId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (productError || !p) {
      throw new Error('Product not found or is not active');
    }

    product = p;
    productId = p.id;
  } else {
    let { data: standardProduct } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('code', 'STANDARD')
      .eq('is_active', true)
      .maybeSingle();

    if (!standardProduct) {
      const { data: altProduct } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      standardProduct = altProduct || null;
    }

    if (!standardProduct) {
      throw new Error('No active products found for tenant');
    }

    product = standardProduct;
    productId = standardProduct.id;
  }

  if (!productId) {
    throw new Error('Product ID is required but was not found');
  }

  // 2) Stay dates + LOS
  const stayDates = generateStayDates(startAt, endAt);
  const days = stayDates.length;

  if (days <= 0) {
    return {
      productId,
      startAt,
      endAt,
      currency,
      availabilityStatus: 'closed',
      remainingCapacity: null,
      pricing: {
        ratePlanId: 'tenant-default',
        ratePlanName: 'standard',
        days: 0,
        basePrice: 0,
        totalPrice: 0,
        surcharges: [],
        discounts: [],
        dynamicPricingApplied: false,
      },
    };
  }

  // 3) Base LOS price from matrix
  let pricingInfo: { ratePlanName: string; totalPrice: number; pricePerDay: number; source: PricingSource };

  try {
    pricingInfo = await getMatrixPriceForStay({
      tenantId,
      productId,
      startAt,
      endAt,
      currency,
      channelCode,
    });
  } catch (error: any) {
    throw new Error(`Failed to get pricing: ${error.message || String(error)}`);
  }

  // 4) Capacity / occupancy

  // Tenant capacity rows for these dates (per tenant)
  const { data: tenantCapRows } = await supabase
    .from('tenant_capacity')
    .select('date, capacity')
    .eq('tenant_id', tenantId)
    .in('date', stayDates);

  // Tenant settings for default capacity
  const { data: tenantSettings } = await supabase
    .from('tenant_settings')
    .select('rolling_capacity_months, default_daily_capacity')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const rollingMonths = tenantSettings?.rolling_capacity_months ?? 12;
  const defaultDailyCapacity = tenantSettings?.default_daily_capacity ?? 250;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizonDate = new Date(today);
  horizonDate.setUTCMonth(horizonDate.getUTCMonth() + rollingMonths);

  const capacityByDate: Record<string, number | null> = {};
  const tenantCapByDate: Record<string, number> = {};

  (tenantCapRows ?? []).forEach((row: any) => {
    tenantCapByDate[row.date] = row.capacity;
  });

  for (const dateStr of stayDates) {
    if (tenantCapByDate[dateStr] !== undefined) {
      capacityByDate[dateStr] = tenantCapByDate[dateStr];
    } else {
      const dateObj = new Date(dateStr + 'T00:00:00Z');
      if (dateObj <= horizonDate) {
        capacityByDate[dateStr] = defaultDailyCapacity;
      } else {
        capacityByDate[dateStr] = null; // closed beyond horizon
      }
    }
  }

  // Bookings that overlap the stay
  let bookingsQuery = supabase
    .from('bookings')
    .select('start_at, end_at, status')
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .lt('start_at', endAt)
    .gt('end_at', startAt);

  if (excludeBookingReference) {
    bookingsQuery = bookingsQuery.neq('reference', excludeBookingReference);
  }

  const { data: bookings, error: bookingsError } = await bookingsQuery;

  if (bookingsError) {
    console.error('[AVAILABILITY] bookingsError in calculateProductAvailability', {
      error: bookingsError,
      tenantId,
      productId: inputProductId,
      startAt,
      endAt,
    });

    if (bookingsError instanceof Error) {
      throw bookingsError;
    }

    const errorObj = bookingsError as { message?: string } | null | undefined;
    const errorMessage =
      errorObj && typeof errorObj === 'object' && 'message' in errorObj && errorObj.message
        ? String(errorObj.message)
        : JSON.stringify(bookingsError);

    throw new Error(`Failed to check bookings: ${errorMessage}`);
  }

  // Time-based availability checking: filter to bookings that overlap the requested time range
  // A booking occupies space from start_at to (end_at + 1 hour buffer)
  const overlappingBookings = (bookings ?? []).filter((booking: any) => {
    return bookingOverlapsTimeRange(booking, startAt, endAt);
  });

  // Count overlapping bookings per date for capacity checking
  const occupancyByDate: Record<string, number> = {};
  for (const dateStr of stayDates) {
    occupancyByDate[dateStr] = 0;
  }

  overlappingBookings.forEach((booking: any) => {
    for (const dateStr of stayDates) {
      if (bookingTouchesDate(booking, dateStr)) {
        occupancyByDate[dateStr] += 1;
      }
    }
  });

  let overallRemaining: number | null = null;
  let availabilityStatus: 'available' | 'sold_out' | 'closed' = 'available';
  let maxOccupancyRatio = 0; // for dynamic pricing

  for (const dateStr of stayDates) {
    const capacity = capacityByDate[dateStr];

    if (capacity === null) {
      availabilityStatus = 'closed';
      overallRemaining = null;
      maxOccupancyRatio = 1; // treat as fully occupied for dynamic, though it's closed anyway
      break;
    }

    const occupancy = occupancyByDate[dateStr] ?? 0;
    const remaining = capacity - occupancy;

    const ratio = capacity > 0 ? occupancy / capacity : 1;
    if (ratio > maxOccupancyRatio) {
      maxOccupancyRatio = ratio;
    }

    if (remaining <= 0) {
      availabilityStatus = 'sold_out';
      overallRemaining = overallRemaining === null ? 0 : Math.min(overallRemaining, 0);
    } else {
      overallRemaining =
        overallRemaining === null ? remaining : Math.min(overallRemaining, remaining);
    }
  }

  if (availabilityStatus === 'available' && (overallRemaining ?? 0) <= 0) {
    availabilityStatus = 'sold_out';
  }

  // 5) Pricing: base + dynamic + surcharges/discounts

  const baseTotal = pricingInfo.totalPrice;

  const surcharges: AvailabilityResult['pricing']['surcharges'] = [];
  const discounts: AvailabilityResult['pricing']['discounts'] = [];
  let dynamicPricingApplied = false;

  // Only apply dynamic pricing if the product is actually available
  if (availabilityStatus === 'available' && baseTotal > 0) {
    const occupancyPercent = maxOccupancyRatio * 100;
    const { increaseAmount, appliedRule } = await applyDynamicPricing({
      supabase,
      tenantId,
      baseTotal,
      occupancyPercent,
    });

    if (increaseAmount > 0 && appliedRule) {
      dynamicPricingApplied = true;
      surcharges.push({
        type: 'dynamic_pricing',
        label: `Dynamic pricing +${appliedRule.price_increase_percent}%`,
        amount: increaseAmount,
        meta: {
          ruleId: appliedRule.id,
          thresholdPercent: appliedRule.threshold_percent,
          priceIncreasePercent: appliedRule.price_increase_percent,
          occupancyPercent,
        },
      });
    }
  }

  const surchargesTotal = surcharges.reduce((sum, s) => sum + (s.amount || 0), 0);
  const discountsTotal = discounts.reduce((sum, d) => sum + (d.amount || 0), 0);
  const finalTotalPrice = baseTotal + surchargesTotal - discountsTotal;

  return {
    productId,
    startAt,
    endAt,
    currency,
    availabilityStatus,
    remainingCapacity: overallRemaining,
    pricing: {
      ratePlanId: pricingInfo.source.ratePlanId || 'standard',
      ratePlanName: pricingInfo.ratePlanName,
      days,
      basePrice: baseTotal,
      totalPrice: finalTotalPrice,
      surcharges,
      discounts,
      dynamicPricingApplied,
      _pricingSource: pricingInfo.source,
    },
  };
}
