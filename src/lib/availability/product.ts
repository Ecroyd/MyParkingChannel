// lib/availability/product.ts
// Product-based availability calculation for supplier API

import { createAdminClient } from '@/lib/supabase/admin';

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
    basePrice: number; // decimal in GBP
    surcharges: any[];
    discounts: any[];
    totalPrice: number;
  };
};

type AvailabilityInput = {
  tenantId: string;
  productId?: string; // Optional - defaults to "Standard Parking"
  startAt: string;
  endAt: string;
  currency?: string;
  excludeBookingReference?: string; // For date change amendments
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

  // 2) Get rate plan for pricing (fallback to tenant_pricing if no rate plan)
  const { data: ratePlan } = await supabase
    .from('product_rate_plans')
    .select('*')
    .eq('product_id', productId)
    .limit(1)
    .maybeSingle();

  // If no rate plan, get from tenant_pricing
  let basePricePerDay: number;
  let ratePlanId: string;
  let ratePlanName: string;
  let pricingCurrency: string = currency;

  if (ratePlan) {
    basePricePerDay = ratePlan.base_price_cents / 100;
    ratePlanId = ratePlan.id;
    ratePlanName = ratePlan.name || 'standard';
    pricingCurrency = ratePlan.currency || currency;
  } else {
    // Fallback to tenant_pricing.daily_rate
    const { data: tenantPricing } = await supabase
      .from('tenant_pricing')
      .select('daily_rate, currency')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    basePricePerDay = Number(tenantPricing?.daily_rate ?? 10);
    ratePlanId = 'tenant-default';
    ratePlanName = 'standard';
    pricingCurrency = tenantPricing?.currency || currency;
  }

  // At this point, productId should always be set (we throw if no product found)
  if (!productId) {
    throw new Error('Product ID is required but was not found');
  }

  const stayDates = generateStayDates(startAt, endAt);
  const days = stayDates.length;

  if (stayDates.length === 0) {
    return {
      productId,
      startAt,
      endAt,
      currency: pricingCurrency,
      availabilityStatus: 'closed',
      remainingCapacity: null,
      pricing: {
        ratePlanId,
        ratePlanName,
        days: 0,
        basePrice: 0,
        totalPrice: 0,
        surcharges: [],
        discounts: [],
      },
    };
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

  // 7) pricing = days * basePricePerDay
  const basePrice = days * basePricePerDay;

  return {
    productId,
    startAt,
    endAt,
    currency: pricingCurrency,
    availabilityStatus,
    remainingCapacity: overallRemaining,
    pricing: {
      ratePlanId,
      ratePlanName,
      days,
      basePrice,
      totalPrice: basePrice,
      surcharges: [],
      discounts: [],
    },
  };
}

