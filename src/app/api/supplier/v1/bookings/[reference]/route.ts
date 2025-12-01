// app/api/supplier/v1/bookings/[reference]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateSupplierApi,
  SupplierAuthError,
} from '@/lib/supplier/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateAvailability } from '@/lib/availability/engine';

type BookingPatchBody = {
  start_at?: string;
  end_at?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  plate?: string;
  car_make?: string;
  car_model?: string;
  car_color?: string;
  flight_number?: string;
  notes?: string;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { reference: string } }
) {
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

    const reference = decodeURIComponent(params.reference);
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('bookings')
      .select(
        'tenant_id, reference, status, start_at, end_at, customer_name, customer_email, customer_phone, plate, car_make, car_model, car_color, flight_number, notes, checked_in_at, checked_out_at, created_at'
      )
      .eq('tenant_id', auth.tenantId)
      .eq('reference', reference)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Booking not found',
          },
        },
        { status: 404 }
      );
    }

    // Optional: enforce that only bookings from this partner are visible,
    // e.g. .eq('source', auth.partnerName.toLowerCase()) in the query above,
    // if you want to restrict them to their own bookings only.

    return NextResponse.json(
      {
        reference: data.reference,
        status: data.status,
        start_at: data.start_at,
        end_at: data.end_at,
        customer: {
          name: data.customer_name,
          email: data.customer_email,
          phone: data.customer_phone,
        },
        vehicle: {
          plate: data.plate,
          make: data.car_make,
          model: data.car_model,
          colour: data.car_color,
        },
        flight_number: data.flight_number,
        notes: data.notes,
        checked_in_at: data.checked_in_at,
        checked_out_at: data.checked_out_at,
        created_at: data.created_at,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof SupplierAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }

    console.error('Supplier GET booking error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { reference: string } }
) {
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

    const reference = decodeURIComponent(params.reference);
    const supabase = createAdminClient();

    // Load existing booking
    const { data: existing, error: existingError } = await supabase
      .from('bookings')
      .select(
        'tenant_id, reference, status, start_at, end_at, customer_name, customer_email, customer_phone, plate, car_make, car_model, car_color, flight_number, notes, checked_in_at, checked_out_at'
      )
      .eq('tenant_id', auth.tenantId)
      .eq('reference', reference)
      .maybeSingle();

    if (existingError || !existing) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Booking not found',
          },
        },
        { status: 404 }
      );
    }

    // Optional: restrict partner to their own bookings only:
    // .eq('source', auth.partnerName.toLowerCase()) in the select above.

    // Block updates after check-in or after "final" states
    if (existing.checked_in_at) {
      return NextResponse.json(
        {
          error: {
            code: 'BOOKING_IN_PROGRESS',
            message:
              'Booking has already checked in and can no longer be amended.',
          },
        },
        { status: 409 }
      );
    }

    if (['cancelled', 'no_show'].includes(existing.status)) {
      return NextResponse.json(
        {
          error: {
            code: 'BOOKING_FINAL',
            message: `Booking is ${existing.status} and can no longer be amended.`,
          },
        },
        { status: 409 }
      );
    }

    const json = (await req.json().catch(() => null)) as BookingPatchBody | null;
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

    const update: any = {};

    // Track whether dates are changing
    const newStart = json.start_at ?? existing.start_at;
    const newEnd = json.end_at ?? existing.end_at;

    // If either start_at or end_at provided, we will treat as a date change.
    const isDateChange =
      json.start_at !== undefined || json.end_at !== undefined;

    if (isDateChange) {
      // Re-check availability for the new dates, excluding this booking.
      const availability = await calculateAvailability({
        tenantId: auth.tenantId,
        startAt: newStart,
        endAt: newEnd,
        currency: 'GBP',
        channel: 'partner',
        excludeReference: existing.reference,
      });

      if (availability.availability_status !== 'available') {
        return NextResponse.json(
          {
            error: {
              code: 'NO_AVAILABILITY',
              message:
                'The requested new dates are not available for this booking.',
            },
          },
          { status: 409 }
        );
      }

      update.start_at = newStart;
      update.end_at = newEnd;
    }

    if (json.customer_name !== undefined) {
      update.customer_name = json.customer_name;
    }
    if (json.customer_email !== undefined) {
      update.customer_email = json.customer_email;
    }
    if (json.customer_phone !== undefined) {
      update.customer_phone = json.customer_phone;
    }

    if (json.plate !== undefined) {
      update.plate = json.plate;
    }
    if (json.car_make !== undefined) {
      update.car_make = json.car_make;
    }
    if (json.car_model !== undefined) {
      update.car_model = json.car_model;
    }
    if (json.car_color !== undefined) {
      update.car_color = json.car_color;
    }

    if (json.flight_number !== undefined) {
      update.flight_number = json.flight_number;
    }
    if (json.notes !== undefined) {
      update.notes = json.notes;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_FIELDS',
            message: 'No updatable fields were provided.',
          },
        },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update(update)
      .eq('tenant_id', auth.tenantId)
      .eq('reference', reference)
      .select(
        'reference, status, start_at, end_at, customer_name, customer_email, customer_phone, plate, car_make, car_model, car_color, flight_number, notes, checked_in_at, checked_out_at'
      )
      .single();

    if (updateError || !updated) {
      console.error('Supplier PATCH booking updateError', updateError);
      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to update booking',
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        reference: updated.reference,
        status: updated.status,
        start_at: updated.start_at,
        end_at: updated.end_at,
        customer: {
          name: updated.customer_name,
          email: updated.customer_email,
          phone: updated.customer_phone,
        },
        vehicle: {
          plate: updated.plate,
          make: updated.car_make,
          model: updated.car_model,
          colour: updated.car_color,
        },
        flight_number: updated.flight_number,
        notes: updated.notes,
        checked_in_at: updated.checked_in_at,
        checked_out_at: updated.checked_out_at,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof SupplierAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }

    console.error('Supplier PATCH booking error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
      { status: 500 }
    );
  }
}

