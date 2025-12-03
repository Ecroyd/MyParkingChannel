import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  authenticateSupplierApi,
  SupplierAuthError,
} from '@/lib/supplier/auth';
import { calculateProductAvailability } from '@/lib/availability/product';
import { AvailabilityResponse } from '@/lib/supplier/types';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

function isValidISO8601(str: string): boolean {
  try {
    const date = new Date(str);
    return !isNaN(date.getTime()) && str.includes('T') && str.includes('Z');
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    // 1. Authenticate supplier using X-API-Key header
    const rawKey = request.headers.get('x-api-key');
    let auth;
    try {
      auth = await authenticateSupplierApi(rawKey);
    } catch (err) {
      if (err instanceof SupplierAuthError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message } },
          { status: err.status }
        );
      }
      throw err;
    }

    // Check scope
    if (!auth.scopes.includes('availability')) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Scope availability not granted' } },
        { status: 403 }
      );
    }

    // 2. Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const product_id = searchParams.get('product_id');
    const start_at = searchParams.get('start_at');
    const end_at = searchParams.get('end_at');
    const currency = searchParams.get('currency') || 'GBP';
    const debug = searchParams.get('debug') === '1';

    // Validation: product_id (required, UUID)
    if (!product_id) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'product_id is required' } },
        { status: 400 }
      );
    }
    if (!isValidUUID(product_id)) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'product_id must be a valid UUID' } },
        { status: 400 }
      );
    }

    // Validation: start_at (required, ISO 8601)
    if (!start_at) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'start_at is required' } },
        { status: 400 }
      );
    }
    if (!isValidISO8601(start_at)) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'start_at must be a valid ISO 8601 datetime string' } },
        { status: 400 }
      );
    }

    // Validation: end_at (required, ISO 8601)
    if (!end_at) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'end_at is required' } },
        { status: 400 }
      );
    }
    if (!isValidISO8601(end_at)) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'end_at must be a valid ISO 8601 datetime string' } },
        { status: 400 }
      );
    }

    // Validation: end_at must be strictly after start_at
    const startDate = new Date(start_at);
    const endDate = new Date(end_at);
    if (endDate <= startDate) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'end_at must be strictly after start_at' } },
        { status: 400 }
      );
    }

    // 3. Use the availability engine
    let availabilityResult;
    try {
      availabilityResult = await calculateProductAvailability({
        tenantId: auth.tenantId,
        productId: product_id,
        startAt: start_at,
        endAt: end_at,
        currency,
        channelCode: auth.channelCode,
      });
    } catch (err: unknown) {
      // Handle product not found or other engine errors
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
          ? err
          : 'Unknown availability engine error';

      if (errorMessage.includes('Product not found') || errorMessage.includes('not active')) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: errorMessage } },
          { status: 404 }
        );
      }
      if (errorMessage.includes('No active products')) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: errorMessage } },
          { status: 404 }
        );
      }

      // For all other errors (including Supabase query errors), return the actual error message
      console.error('Availability engine error:', err);
      return NextResponse.json(
        {
          error: 'availability_engine_failed',
          message: errorMessage,
        },
        { status: 500 }
      );
    }

    // 4. Build response
    const response: AvailabilityResponse = {
      product_id: availabilityResult.productId,
      start_at: availabilityResult.startAt,
      end_at: availabilityResult.endAt,
      currency: availabilityResult.currency,
      availability_status: availabilityResult.availabilityStatus,
      remaining_capacity: availabilityResult.remainingCapacity,
      pricing: {
        rate_plan: availabilityResult.pricing.ratePlanName,
        days: availabilityResult.pricing.days,
        base_price: availabilityResult.pricing.basePrice,
        surcharges: availabilityResult.pricing.surcharges || [],
        discounts: availabilityResult.pricing.discounts || [],
        total_price: availabilityResult.pricing.totalPrice,
      },
    };

    // 5. Add debug information if requested
    if (debug) {
      const supabase = createAdminClient();

      // Load tenant settings for debug info
      const { data: tenantSettings } = await supabase
        .from('tenant_settings')
        .select('rolling_capacity_months, default_daily_capacity')
        .eq('tenant_id', auth.tenantId)
        .maybeSingle();

      // Generate stay dates for debug
      const DAY_MS = 1000 * 60 * 60 * 24;
      const start = new Date(start_at);
      const end = new Date(end_at);
      const startUTC = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
      const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
      const dateRange: string[] = [];
      let cursor = startUTC.getTime();
      if (endUTC.getTime() < startUTC.getTime()) {
        endUTC.setTime(startUTC.getTime());
      }
      while (cursor <= endUTC.getTime()) {
        const d = new Date(cursor);
        dateRange.push(d.toISOString().slice(0, 10));
        cursor += DAY_MS;
      }

      // Load capacity data for debug
      const { data: capacityRows } = await supabase
        .from('tenant_capacity')
        .select('date, capacity')
        .eq('tenant_id', auth.tenantId)
        .in('date', dateRange);

      const capacityByDate: Record<string, number | null> = {};
      const tenantCapByDate: Record<string, number> = {};
      (capacityRows ?? []).forEach((row: any) => {
        tenantCapByDate[row.date] = row.capacity;
      });

      // Calculate capacity for each date (including defaults)
      const rollingMonths = tenantSettings?.rolling_capacity_months ?? 12;
      const defaultDailyCapacity = tenantSettings?.default_daily_capacity ?? 250;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const horizonDate = new Date(today);
      horizonDate.setUTCMonth(horizonDate.getUTCMonth() + rollingMonths);

      let hasClosedDate = false;
      for (const dateStr of dateRange) {
        if (tenantCapByDate[dateStr] !== undefined) {
          capacityByDate[dateStr] = tenantCapByDate[dateStr];
        } else {
          const dateObj = new Date(dateStr + 'T00:00:00Z');
          if (dateObj <= horizonDate) {
            capacityByDate[dateStr] = defaultDailyCapacity;
          } else {
            capacityByDate[dateStr] = null;
            hasClosedDate = true;
          }
        }
      }

      // Calculate min capacity
      const capacities = Object.values(capacityByDate).filter((c): c is number => c !== null);
      const minCapacityAcrossDays = capacities.length > 0 ? Math.min(...capacities) : null;

      // Add pricing source info
      const pricingSource = availabilityResult.pricing._pricingSource;
      const pricingSourceInfo = pricingSource ? {
        table: pricingSource.table,
        rate_plan_id: pricingSource.ratePlanId || null,
        rate_plan_name: pricingSource.ratePlanName,
        price_per_day: pricingSource.pricePerDay,
        days: availabilityResult.pricing.days,
        base_price_total: availabilityResult.pricing.basePrice * availabilityResult.pricing.days,
        season_id: pricingSource.seasonId || null,
        channel_code: pricingSource.channelCode || null,
        pricing_rule_id: pricingSource.pricingRuleId || null,
        tier_id: pricingSource.tierId || null,
        tier_type: pricingSource.tierType || null,
        tier_value: pricingSource.tierValue || null,
      } : null;

      (response as any).debug = {
        tenant_id: auth.tenantId,
        rolling_capacity_months: rollingMonths,
        default_daily_capacity: defaultDailyCapacity,
        date_range: dateRange,
        capacity_by_date: capacityByDate,
        has_closed_date: hasClosedDate,
        min_capacity_across_days: minCapacityAcrossDays,
        pricing_source: pricingSourceInfo,
      };
    }

    return NextResponse.json(response, { status: 200 });
  } catch (err: any) {
    if (err instanceof SupplierAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }

    console.error('Availability handler error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
      { status: 500 }
    );
  }
}
