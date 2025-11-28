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

function parseBody(body: any): BookingCreateRequest {
  return body as BookingCreateRequest;
}

function generateInternalReference(): string {
  const now = new Date();
  // Simple reference; replace with our existing booking reference logic if we have one
  return `MPC-${now.getFullYear()}-${Math.floor(
    Math.random() * 1_000_000
  )
    .toString()
    .padStart(6, '0')}`;
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

    if (!body.product_id || !body.start_at || !body.end_at || !body.customer || !body.price) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message:
              'product_id, start_at, end_at, customer and price are required',
          },
        },
        { status: 400 }
      );
    }

    const externalRef = body.external_reference ?? null;
    const partnerNameLower = auth.partnerName.toLowerCase();

    const supabase = createAdminClient();

    // Idempotency: if external_reference exists for this partner+tenant, return existing booking
    // Using dedupe_key pattern: partner:external_ref
    if (externalRef) {
      const dedupeKey = `${partnerNameLower}:${externalRef}`;
      const { data: existing, error: existingError } = await supabase
        .from('bookings')
        .select('id, reference, status, created_at')
        .eq('tenant_id', auth.tenantId)
        .eq('dedupe_key', dedupeKey)
        .maybeSingle();

      if (!existingError && existing) {
        const resp: BookingCreateResponse = {
          reference: existing.reference,
          status: existing.status === 'reserved' ? 'confirmed' : (existing.status as any),
          source: partnerNameLower,
          created_at: existing.created_at,
        };
        return NextResponse.json(resp, { status: 200 });
      }
    }

    const reference = externalRef || generateInternalReference();
    const dedupeKey = externalRef ? `${partnerNameLower}:${externalRef}` : null;

    const customerName = `${body.customer.first_name} ${body.customer.last_name}`.trim();
    const flightNumber = body.flight?.departure_number || body.flight?.arrival_number || null;

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        tenant_id: auth.tenantId,
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
        status: 'reserved',
        money_charged: body.price.total,
        money_received: 0,
        notes: `Source: ${auth.partnerName}${
          externalRef ? `, external_reference: ${externalRef}` : ''
        }`,
        source: partnerNameLower, // make sure enum includes this
        flight_number: flightNumber,
        dedupe_key: dedupeKey,
        is_incomplete: false,
        missing_fields: [],
        direction: 'arrival',
      })
      .select('created_at')
      .single();

    if (error) {
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
      status: 'confirmed', // or 'reserved' depending on our semantics
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
