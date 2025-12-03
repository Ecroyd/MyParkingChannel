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

    // Check existing bookings for this product
    const { data: bookings } = await supabase
      .from('bookings')
      .select('start_at, end_at, status')
      .eq('tenant_id', auth.tenantId)
      .eq('product_id', body.product_id)
      .in('status', ['reserved', 'confirmed', 'checked_in'])
      .lt('start_at', body.end_at)
      .gt('end_at', body.start_at);

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

    // Calculate money_charged from rate plan
    const days = stayDates.length;
    const money_charged = body.price?.total ?? days * (ratePlan.base_price_cents / 100);

    const reference = externalRef || generateInternalReference();
    const customerName = `${body.customer.first_name} ${body.customer.last_name}`.trim();
    const flightNumber = body.flight?.departure_number || body.flight?.arrival_number || null;

    // 4) Insert booking with tenant_id, product_id, rate_plan_id, money_charged, status 'confirmed'
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        tenant_id: auth.tenantId,
        product_id: body.product_id,
        rate_plan_id: ratePlan.id,
        reference,
        customer_name: customerName,
        customer_email: body.customer.email,
        customer_phone: body.customer.phone || null,
        plate: body.vehicle?.plate ?? '',
        car_make: body.vehicle?.make ?? null,
        car_model: body.vehicle?.model ?? null,
        car_color: body.vehicle?.colour ?? null,
        start_at: body.start_at,
        end_at: body.end_at,
        status: 'confirmed',
        money_charged,
        money_received: 0,
        notes: `Source: ${auth.partnerName}${externalRef ? `, external_reference: ${externalRef}` : ''}`,
        source: partnerNameLower,
        flight_number: flightNumber,
        dedupe_key: externalRef ? makeDedupeKey({ external_reference: externalRef, partner: partnerNameLower }) : null,
        is_incomplete: false,
        missing_fields: [],
        direction: 'arrival',
      })
      .select('created_at')
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
              source: partnerNameLower,
              created_at: existing.created_at,
            };
            return NextResponse.json(resp, { status: 200 });
          }
        }
      }

      console.error('Bookings insert error', error);
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

    const resp: BookingCreateResponse = {
      reference,
      status: 'confirmed',
      source: partnerNameLower,
      created_at: data.created_at,
    };

    return NextResponse.json(resp, { status: 201 });
  } catch (err: any) {
    if (err instanceof SupplierAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }

    console.error('Bookings handler error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
      { status: 500 }
    );
  }
}
