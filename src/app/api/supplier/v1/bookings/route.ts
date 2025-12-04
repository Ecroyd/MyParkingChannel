// app/api/supplier/v1/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  authenticateSupplierApi,
  SupplierAuthError,
} from '@/lib/supplier/auth';
import {
  BookingCreateRequest,
  BookingCreateResponse,
} from '@/lib/supplier/types';
import { makeDedupeKey, checkDuplicateBooking } from '@/lib/bookings/dedupe';

const DAY_MS = 1000 * 60 * 60 * 24;

function parseBody(body: any): BookingCreateRequest {
  return body as BookingCreateRequest;
}

function generateInternalReference(): string {
  const now = new Date();
  return `MPC-${now.getFullYear()}-${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')}`;
}

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

export async function POST(req: NextRequest) {
  try {
    const rawKey = req.headers.get('x-api-key');
    const auth = await authenticateSupplierApi(rawKey);

    if (!auth.scopes.includes('bookings')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Scope bookings not granted',
          },
        },
        { status: 403 }
      );
    }

    const json = await req.json().catch(() => null);
    if (!json) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Body must be valid JSON',
          },
        },
        { status: 400 }
      );
    }

    const body = parseBody(json);

    if (!body.product_id || !body.start_at || !body.end_at || !body.customer) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'product_id, start_at, end_at, and customer are required',
          },
        },
        { status: 400 }
      );
    }

    const externalRef = body.external_reference ?? null;
    const partnerNameLower = auth.partnerName.toLowerCase();
    const supabase = createAdminClient();

    // Enforce idempotency via external_reference
    if (externalRef) {
      const existing = await checkDuplicateBooking(supabase, auth.tenantId, externalRef);
      if (existing) {
        const resp: BookingCreateResponse = {
          reference: existing.reference,
          status: existing.status === 'reserved' ? 'confirmed' : (existing.status as any),
          source: partnerNameLower,
          created_at: existing.created_at,
        };
        return NextResponse.json(resp, { status: 200 });
      }
    }

    // 1) Validate product_id is real
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', body.product_id)
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Product not found or is not active',
          },
        },
        { status: 404 }
      );
    }

    // 2) Load the rate plan for pricing
    const { data: ratePlan, error: ratePlanError } = await supabase
      .from('product_rate_plans')
      .select('*')
      .eq('product_id', body.product_id)
      .limit(1)
      .maybeSingle();

    if (ratePlanError || !ratePlan) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Rate plan not found for product',
          },
        },
        { status: 404 }
      );
    }

    // 3) Check capacity for that product
    const stayDates = generateStayDates(body.start_at, body.end_at);

    // Load product_capacity
    const { data: productCapRows } = await supabase
      .from('product_capacity')
      .select('date, capacity')
      .eq('tenant_id', auth.tenantId)
      .eq('product_id', body.product_id)
      .in('date', stayDates);

    // Load tenant_capacity
    const { data: tenantCapRows } = await supabase
      .from('tenant_capacity')
      .select('date, capacity')
      .eq('tenant_id', auth.tenantId)
      .in('date', stayDates);

    // Load tenant_settings
    const { data: tenantSettings } = await supabase
      .from('tenant_settings')
      .select('rolling_capacity_months, default_daily_capacity')
      .eq('tenant_id', auth.tenantId)
      .maybeSingle();

    const rollingMonths = tenantSettings?.rolling_capacity_months ?? 12;
    const defaultDailyCapacity = tenantSettings?.default_daily_capacity ?? 250;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const horizonDate = new Date(today);
    horizonDate.setUTCMonth(horizonDate.getUTCMonth() + rollingMonths);

    const productCapByDate: Record<string, number> = {};
    const tenantCapByDate: Record<string, number> = {};

    (productCapRows ?? []).forEach((row: any) => {
      productCapByDate[row.date] = row.capacity;
    });

    (tenantCapRows ?? []).forEach((row: any) => {
      tenantCapByDate[row.date] = row.capacity;
    });

    // Determine capacity for each date
    const capacityByDate: Record<string, number | null> = {};
    for (const dateStr of stayDates) {
      if (productCapByDate[dateStr] !== undefined) {
        capacityByDate[dateStr] = productCapByDate[dateStr];
      } else if (tenantCapByDate[dateStr] !== undefined) {
        capacityByDate[dateStr] = tenantCapByDate[dateStr];
      } else {
        const dateObj = new Date(dateStr + 'T00:00:00Z');
        if (dateObj <= horizonDate) {
          capacityByDate[dateStr] = defaultDailyCapacity;
        } else {
          capacityByDate[dateStr] = null;
        }
      }
    }

    // Check existing bookings for this product using time-based overlap checking
    // Query bookings that might overlap (broad filter, then precise check)
    const { data: bookings } = await supabase
      .from('bookings')
      .select('start_at, end_at, status')
      .eq('tenant_id', auth.tenantId)
      .eq('product_id', body.product_id)
      .in('status', ['reserved', 'confirmed', 'checked_in'])
      .lt('start_at', body.end_at)
      .gt('end_at', body.start_at);

    // Filter to bookings that actually overlap with the requested time range (with 1-hour buffer)
    const overlappingBookings = (bookings ?? []).filter((booking: any) => {
      return bookingOverlapsTimeRange(booking, body.start_at, body.end_at);
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

    // Check if there's capacity
    for (const dateStr of stayDates) {
      const capacity = capacityByDate[dateStr];
      if (capacity === null) {
        return NextResponse.json(
          {
            error: {
              code: 'NO_AVAILABILITY',
              message: `Date ${dateStr} is closed`,
            },
          },
          { status: 409 }
        );
      }

      const occupancy = occupancyByDate[dateStr] ?? 0;
      if (occupancy >= capacity) {
        return NextResponse.json(
          {
            error: {
              code: 'NO_AVAILABILITY',
              message: `No capacity available for date ${dateStr}`,
            },
          },
          { status: 409 }
        );
      }
    }

    // 4) Prepare schema-safe insert payload
    const rawBody = json; // Already have the raw JSON body
    const customer = body.customer ?? {};
    const vehicle = body.vehicle ?? {};
    const total = Number(body?.price?.total ?? 0);

    if (!Number.isFinite(total) || total <= 0) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PRICE',
            message: 'price.total must be a positive number',
          },
        },
        { status: 400 }
      );
    }

    // Get partner name from auth
    const partnerName = auth.partnerName ?? 'unknown partner';

    // Optional external source string coming from body (if you want to allow it)
    const externalSourceFromBody =
      typeof rawBody.source === 'string' && rawBody.source.trim().length > 0
        ? rawBody.source.trim()
        : null;

    // Optionally allow override from a header too (e.g. X-Booking-Source)
    const externalSourceFromHeader = (() => {
      const headerVal = req.headers.get('x-booking-source');
      return headerVal && headerVal.trim().length > 0 ? headerVal.trim() : null;
    })();

    // Final external source label we'll store as free text
    const externalSourceLabel =
      externalSourceFromBody ??
      externalSourceFromHeader ??
      partnerName ??
      'supplier_api';

    const fullName = [customer.first_name, customer.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    const reference = externalRef || generateInternalReference();

    // Now the insert payload
    const insertPayload = {
      tenant_id: auth.tenantId,
      reference,
      customer_name: fullName || customer.email || 'Unknown customer',
      customer_email: body.customer.email,
      plate: vehicle.plate ?? '',
      car_make: vehicle.make ?? null,
      car_model: vehicle.model ?? null,
      car_color: vehicle.colour ?? null,
      start_at: rawBody.start_at,
      end_at: rawBody.end_at,
      status: 'reserved', // booking_status enum
      source: 'supplier_api', // ✅ safe enum value, won't ever break inserts
      external_source: externalSourceLabel, // ✅ free text for partner/billing
      money_charged: total,
      money_received: 0,
      notes: `Supplier API booking from ${partnerName} (product_id=${rawBody.product_id ?? 'n/a'}, external_ref=${
        rawBody.external_reference ?? 'n/a'
      })`,
    };

    const { data, error } = await supabase
      .from('bookings')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      // Handle duplicate key errors
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        if (externalRef) {
          const existing = await checkDuplicateBooking(supabase, auth.tenantId, externalRef);
          if (existing) {
            const resp: BookingCreateResponse = {
              reference: existing.reference,
              status: existing.status === 'reserved' ? 'confirmed' : (existing.status as any),
              source: (existing as any).source || 'agent',
              created_at: existing.created_at,
            };
            return NextResponse.json(resp, { status: 200 });
          }
        }
      }

      console.error('[SUPPLIER_BOOKING] Database insert error', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        tenantId: auth.tenantId,
        productId: body.product_id,
        source: auth.partnerName,
      });
      throw error;
    }

    return NextResponse.json(
      {
        reference: data.reference,
        status: data.status,
        source: data.source,
        created_at: data.created_at,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof SupplierAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }

    console.error('[SUPPLIER_BOOKING] Failed to create booking', {
      err,
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
      code: err?.code,
    });
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create booking',
        },
      },
      { status: 500 }
    );
  }
}
