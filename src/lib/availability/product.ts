// lib/availability/product.ts
// Product-based availability calculation for supplier API

import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';

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
    basePrice: number; // decimal in GBP (daily rate)
    surcharges: any[];
    discounts: any[];
    totalPrice: number;
    _pricingSource?: PricingSource; // Internal field for debug
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

type PricingSource = {
  table: string;
  ratePlanId?: string | null;
  ratePlanName: string;
  pricePerDay: number;
  seasonId?: string | null;
  channelCode?: string;
  pricingRuleId?: string;
  tierId?: string;
  tierType?: string;
  tierValue?: number;
};

/**
 * Generate a list of dates (YYYY-MM-DD) covering the stay
 */
function generateStayDates(startAt: string, endAt: string): string[] {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startUTC = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const dates: string[] = [];
  let cursor = startUTC.getTime();
  if (endUTC.getTime() < startUTC.getTime()) {
    endUTC.setTime(startUTC.getTime());
  }
  while (cursor <= endUTC.getTime()) {
    const d = new Date(cursor);
    dates.push(d.toISOString().slice(0, 10));
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
 * Find season ID for a given date range
 */
async function findSeasonForDateRange(
  supabase: SupabaseClient,
  tenantId: string,
  firstDate: string
): Promise<string | null> {
  const { data: seasonRanges } = await supabase
    .from('season_ranges')
    .select('season_id, range')
    .eq('tenant_id', tenantId)
    .limit(100);

  if (!seasonRanges || seasonRanges.length === 0) {
    return null;
  }

  // Check if any season range covers our date
  for (const sr of seasonRanges) {
    const rangeStr = sr.range as string;
    // Parse daterange format [start,end) or (start,end)
    const match = rangeStr.match(/^[\[\(]([^,]+),([^,\)]+)[\)\]]$/);
    if (match) {
      const rangeStart = match[1];
      const rangeEnd = match[2];
      if (firstDate >= rangeStart && firstDate < rangeEnd) {
        return sr.season_id;
      }
    }
  }

  return null;
}

/**
 * Get base price per day from pricing tables (source of truth from admin Pricing UI)
 * Implements proper pricing_rules and price_tiers resolution
 */
async function getProductBasePricePerDay(
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
): Promise<{ ratePlanName: string; pricePerDay: number; source: PricingSource }> {
  const { tenantId, productId, startAt, endAt, currency, channelCode, days } = params;
  const stayDates = generateStayDates(startAt, endAt);
  const firstDate = stayDates[0];

  // Default channel code for supplier API
  const effectiveChannelCode = channelCode || 'agent';

  // Step 1: Get base daily rate from rate_plan or tenant_pricing
  let baseDailyRate: number;
  let ratePlanId: string | null = null;
  let ratePlanName = 'standard';

  // Try to get rate plan from product_rate_plans
  const { data: ratePlan } = await supabase
    .from('product_rate_plans')
    .select('id, name, base_price_cents, currency')
    .eq('product_id', productId)
    .limit(1)
    .maybeSingle();

  if (ratePlan) {
    baseDailyRate = ratePlan.base_price_cents / 100;
    ratePlanId = ratePlan.id;
    ratePlanName = ratePlan.name || 'standard';
  } else {
    // Fallback to tenant_pricing for base rate
    const { data: tenantPricing, error: pricingError } = await supabase
      .from('tenant_pricing')
      .select('daily_rate, currency')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (pricingError) {
      throw new Error(`Failed to get base pricing: ${pricingError.message || JSON.stringify(pricingError)}`);
    }

    if (!tenantPricing || !tenantPricing.daily_rate) {
      throw new Error('No base pricing configured. Please configure pricing in the admin Pricing UI.');
    }

    baseDailyRate = Number(tenantPricing.daily_rate);
    if (isNaN(baseDailyRate) || baseDailyRate <= 0) {
      throw new Error(`Invalid daily_rate in tenant_pricing: ${tenantPricing.daily_rate}`);
    }
    ratePlanId = 'tenant-default';
  }

  // Step 2: Find season for the date range
  const seasonId = await findSeasonForDateRange(supabase, tenantId, firstDate);

  // Step 3: Query pricing_rules with proper filters
  // For LOS matrix, we need to match rules where the stay length falls within min_stay and max_stay
  // Typically: min_stay <= days AND (max_stay >= days OR max_stay IS NULL)
  // But also support exact matches: min_stay = days AND (max_stay = days OR max_stay IS NULL)
  let pricingRulesQuery = supabase
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
      is_active
    `)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .lte('min_stay', days)
    .or(`max_stay.is.null,max_stay.gte.${days}`);

  // Filter by season
  if (seasonId) {
    pricingRulesQuery = pricingRulesQuery.eq('season_id', seasonId);
  } else {
    pricingRulesQuery = pricingRulesQuery.is('season_id', null);
  }

  // Filter by rate_plan (if we have one)
  if (ratePlanId && ratePlanId !== 'tenant-default') {
    pricingRulesQuery = pricingRulesQuery.eq('rate_plan_id', ratePlanId);
  } else {
    pricingRulesQuery = pricingRulesQuery.is('rate_plan_id', null);
  }

  // Note: We'll fetch all matching rules and filter by channel in JavaScript
  // This is because Supabase .or() with nulls can be tricky

  const { data: allRules, error: rulesError } = await pricingRulesQuery.order('priority', { ascending: true });

  if (rulesError) {
    console.error('[AVAILABILITY] Error querying pricing_rules:', rulesError);
    // Fallback to base rate without rule
    return {
      ratePlanName,
      pricePerDay: baseDailyRate,
      source: {
        table: ratePlanId === 'tenant-default' ? 'tenant_pricing' : 'product_rate_plans',
        ratePlanId,
        ratePlanName,
        pricePerDay: baseDailyRate,
        channelCode: effectiveChannelCode,
        seasonId,
      },
    };
  }

  if (!allRules || allRules.length === 0) {
    // No pricing rules found, use base rate
    return {
      ratePlanName,
      pricePerDay: baseDailyRate,
      source: {
        table: ratePlanId === 'tenant-default' ? 'tenant_pricing' : 'product_rate_plans',
        ratePlanId,
        ratePlanName,
        pricePerDay: baseDailyRate,
        channelCode: effectiveChannelCode,
        seasonId,
      },
    };
  }

  // Step 4: Filter by channel and apply channel precedence
  // First, prioritize exact day matches (min_stay === days), then range matches
  // Filter rules where channel matches or is null
  const exactDayMatches = allRules.filter(r => 
    r.min_stay === days && (r.max_stay === null || r.max_stay === days) &&
    (!r.channel || r.channel === effectiveChannelCode || r.channel === 'agent' || r.channel === 'all')
  );
  
  const rangeMatches = allRules.filter(r => 
    r.min_stay !== days && r.min_stay <= days && (r.max_stay === null || r.max_stay >= days) &&
    (!r.channel || r.channel === effectiveChannelCode || r.channel === 'agent' || r.channel === 'all')
  );
  
  // Prefer exact day matches over range matches
  const channelFilteredRules = exactDayMatches.length > 0 ? exactDayMatches : rangeMatches;

  if (channelFilteredRules.length === 0) {
    // No matching channel rules, use base rate
    return {
      ratePlanName,
      pricePerDay: baseDailyRate,
      source: {
        table: ratePlanId === 'tenant-default' ? 'tenant_pricing' : 'product_rate_plans',
        ratePlanId,
        ratePlanName,
        pricePerDay: baseDailyRate,
        channelCode: effectiveChannelCode,
        seasonId,
      },
    };
  }

  // Apply channel precedence and select best rule
  // Precedence: channel-specific > 'agent' > 'all' > null
  let selectedRule = null;
  
  // Try channel-specific first
  selectedRule = channelFilteredRules.find(r => r.channel === effectiveChannelCode);
  
  // Try 'agent' channel
  if (!selectedRule && effectiveChannelCode !== 'agent') {
    selectedRule = channelFilteredRules.find(r => r.channel === 'agent');
  }
  
  // Try 'all' channel
  if (!selectedRule && effectiveChannelCode !== 'all') {
    selectedRule = channelFilteredRules.find(r => r.channel === 'all');
  }
  
  // Try null channel
  if (!selectedRule) {
    selectedRule = channelFilteredRules.find(r => !r.channel);
  }
  
  // If still no rule, use first one (already sorted by priority)
  if (!selectedRule) {
    selectedRule = channelFilteredRules[0];
  }

  // Step 5: Get price_tier for the selected rule
  const { data: tier, error: tierError } = await supabase
    .from('price_tiers')
    .select('id, type, value')
    .eq('id', selectedRule.tier_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (tierError || !tier) {
    console.error('[AVAILABILITY] Error getting price_tier:', tierError);
    // Fallback to base rate
    return {
      ratePlanName,
      pricePerDay: baseDailyRate,
      source: {
        table: ratePlanId === 'tenant-default' ? 'tenant_pricing' : 'product_rate_plans',
        ratePlanId,
        ratePlanName,
        pricePerDay: baseDailyRate,
        channelCode: effectiveChannelCode,
        seasonId,
      },
    };
  }

  // Step 6: Calculate price_per_day based on tier type
  // IMPORTANT: For LOS matrix pricing rules (where min_stay === max_stay === days),
  // the tier.value stored in the database is the TOTAL price for that stay length,
  // even though tier.type is 'multiplier'. This is how the admin Pricing UI stores LOS prices.
  // For example: if admin sets "2 per day for 3 days", it stores tier.value = 6 (total).
  let pricePerDay: number;
  const tierValue = Number(tier.value);
  
  // Check if this is a LOS matrix rule (exact day match: min_stay === max_stay === days)
  const isLosMatrixRule = selectedRule.min_stay === days && (selectedRule.max_stay === null || selectedRule.max_stay === days);
  
  if (isLosMatrixRule) {
    // LOS matrix rule: tier.value is the TOTAL price for this exact stay length
    // Divide by days to get per-day rate
    pricePerDay = tierValue / days;
  } else if (tier.type === 'flat' || tier.type === 'absolute') {
    // Flat/Absolute: tier.value is the final per-day price
    pricePerDay = tierValue;
  } else if (tier.type === 'multiplier') {
    // Regular multiplier (for non-LOS rules): base_daily_rate * tier.value
    pricePerDay = baseDailyRate * tierValue;
  } else {
    // Unknown type: try to infer from rule structure
    if (selectedRule.min_stay === days && (selectedRule.max_stay === null || selectedRule.max_stay === days)) {
      // Looks like LOS matrix rule, treat as total price
      pricePerDay = tierValue / days;
    } else {
      // Fallback to multiplier behavior
      console.warn(`[AVAILABILITY] Unknown tier type: ${tier.type}, treating as multiplier`);
      pricePerDay = baseDailyRate * tierValue;
    }
  }

  if (isNaN(pricePerDay) || pricePerDay <= 0) {
    throw new Error(`Invalid price calculation: baseDailyRate=${baseDailyRate}, tier.type=${tier.type}, tier.value=${tier.value}`);
  }

  return {
    ratePlanName,
    pricePerDay,
    source: {
      table: 'pricing_rules',
      ratePlanId: selectedRule.rate_plan_id,
      ratePlanName,
      pricePerDay,
      seasonId: selectedRule.season_id,
      channelCode: selectedRule.channel || effectiveChannelCode,
      pricingRuleId: selectedRule.id,
      tierId: selectedRule.tier_id,
      tierType: tier.type,
      tierValue: tierValue,
    },
  };
}

/**
 * Calculate availability for a product using tenant capacity and pricing
 */
export async function calculateProductAvailability(
  input: AvailabilityInput
): Promise<AvailabilityResult> {
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

  // 1) Get or find "Standard Parking" product
  let productId: string | null = null;
  let product: any;

  if (inputProductId) {
    // Validate provided product_id belongs to tenant
    const { data: p, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', inputProductId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .single();

    if (productError || !p) {
      throw new Error('Product not found or is not active');
    }

    product = p;
    productId = p.id;
  } else {
    // Default to "Standard Parking" product - try multiple strategies
    // First try code = 'STANDARD'
    let { data: standardProduct } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('code', 'STANDARD')
      .eq('is_active', true)
      .maybeSingle();

    if (!standardProduct) {
      // Try name contains "Standard"
      const { data: altProduct } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .ilike('name', '%standard%')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      standardProduct = altProduct || null;
    }

    if (!standardProduct) {
      // If no "Standard" product found, use the first active product
      const { data: firstProduct } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstProduct) {
        throw new Error('No active products found for tenant');
      }

      product = firstProduct;
      productId = firstProduct.id;
    } else {
      product = standardProduct;
      productId = standardProduct.id;
    }
  }

  // At this point, productId should always be set (we throw if no product found)
  if (!productId) {
    throw new Error('Product ID is required but was not found');
  }

  // 2) Get pricing from database (source of truth from admin Pricing UI)
  const stayDates = generateStayDates(startAt, endAt);
  const days = stayDates.length;

  let pricingInfo: { ratePlanName: string; pricePerDay: number; source: PricingSource };
  let pricingCurrency: string = currency;

  if (stayDates.length === 0) {
    // Return early with zero pricing if no dates
    return {
      productId,
      startAt,
      endAt,
      currency: pricingCurrency,
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
      },
    };
  }

  try {
    pricingInfo = await getProductBasePricePerDay(supabase, {
      tenantId,
      productId,
      startAt,
      endAt,
      currency,
      channelCode,
      days,
    });

    // Get currency from tenant_pricing if we used that source
    if (pricingInfo.source.table === 'tenant_pricing') {
      const { data: tenantPricing } = await supabase
        .from('tenant_pricing')
        .select('currency')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      pricingCurrency = tenantPricing?.currency || currency;
    }
  } catch (error: any) {
    throw new Error(`Failed to get pricing: ${error.message || String(error)}`);
  }

  // 3) Determine capacity for each date
  // Priority: tenant_capacity > tenant_settings > closed

  // Load tenant_capacity rows
  const { data: tenantCapRows } = await supabase
    .from('tenant_capacity')
    .select('date, capacity')
    .eq('tenant_id', tenantId)
    .in('date', stayDates);

  // Load tenant_settings for rolling capacity defaults
  const { data: tenantSettings } = await supabase
    .from('tenant_settings')
    .select('rolling_capacity_months, default_daily_capacity')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const rollingMonths = tenantSettings?.rolling_capacity_months ?? 12;
  const defaultDailyCapacity = tenantSettings?.default_daily_capacity ?? 250;

  // Calculate booking horizon
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const horizonDate = new Date(today);
  horizonDate.setUTCMonth(horizonDate.getUTCMonth() + rollingMonths);

  // Build capacity map
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
        capacityByDate[dateStr] = null; // closed
      }
    }
  }

  // 4) Calculate occupancy - query bookings that overlap the period
  // Capacity is per tenant, not per product, so we count ALL bookings for the tenant
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

    // Rethrow the original error so the route can see the actual message
    if (bookingsError instanceof Error) {
      throw bookingsError;
    } else {
      // If bookingsError is not an Error object, create one with the message
      // Supabase errors typically have a message property
      const errorObj = bookingsError as { message?: string } | null | undefined;
      const errorMessage = 
        (errorObj && typeof errorObj === 'object' && 'message' in errorObj && errorObj.message)
          ? String(errorObj.message)
          : JSON.stringify(bookingsError);
      throw new Error(`Failed to check bookings: ${errorMessage}`);
    }
  }

  // Count occupancy per date
  const occupancyByDate: Record<string, number> = {};
  for (const dateStr of stayDates) {
    occupancyByDate[dateStr] = 0;
  }

  (bookings ?? []).forEach((booking: any) => {
    for (const dateStr of stayDates) {
      if (bookingTouchesDate(booking, dateStr)) {
        occupancyByDate[dateStr] += 1;
      }
    }
  });

  // 5) Calculate remaining_capacity = capacity - occupancy
  let overallRemaining: number | null = null;
  let availabilityStatus: 'available' | 'sold_out' | 'closed' = 'available';

  for (const dateStr of stayDates) {
    const capacity = capacityByDate[dateStr];

    // 6) availability_status logic
    if (capacity === null) {
      availabilityStatus = 'closed';
      overallRemaining = null;
      break;
    }

    const occupancy = occupancyByDate[dateStr] ?? 0;
    const remaining = capacity - occupancy;

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

  // 7) pricing - base_price is the daily rate
  const basePricePerDay = pricingInfo.pricePerDay; // Daily rate (e.g., 7 GBP per day)
  const surcharges: any[] = [];
  const discounts: any[] = [];
  
  // Calculate total: base_price * days + surcharges - discounts
  const surchargesTotal = surcharges.reduce((sum, s) => sum + (s.amount || 0), 0);
  const discountsTotal = discounts.reduce((sum, d) => sum + (d.amount || 0), 0);
  const totalPrice = basePricePerDay * days + surchargesTotal - discountsTotal;

  return {
    productId,
    startAt,
    endAt,
    currency: pricingCurrency,
    availabilityStatus,
    remainingCapacity: overallRemaining,
    pricing: {
      ratePlanId: pricingInfo.source.ratePlanId || 'tenant-default',
      ratePlanName: pricingInfo.ratePlanName,
      days,
      basePrice: basePricePerDay,
      totalPrice,
      surcharges,
      discounts,
      // Include pricing source for debug
      _pricingSource: pricingInfo.source,
    },
  };
}

