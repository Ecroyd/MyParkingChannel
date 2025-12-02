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

    // If no capacity row or zero capacity, this day is closed
    if (!capRow || capRow.capacity <= 0) {
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

  // Try to get LOS pricing for this channel
  let base_price = 0;
  let currencyFromPricing = currency;
  
  try {
    const { getPriceForStay } = await import('./pricing/channel');
    const losPrice = await getPriceForStay({
      tenantId,
      seasonId,
      ratePlanId: null,
      channelCode: effectiveChannelCode,
      days,
    });

    if (losPrice !== null) {
      base_price = losPrice;
    } else {
      // Fallback to tenant_pricing
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
    // Fallback to tenant_pricing
    const { data: pricing } = await supabase
      .from('tenant_pricing')
      .select('daily_rate, currency')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const basePricePerDay: number = Number(pricing?.daily_rate ?? 10);
    base_price = basePricePerDay * days;
    currencyFromPricing = pricing?.currency || currency;
  }

  const surcharges: { code: string; description?: string; amount: number }[] = [];
  const discounts: { code: string; description?: string; amount: number }[] = [];
  const total_price = base_price;

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
    },
  };
}
