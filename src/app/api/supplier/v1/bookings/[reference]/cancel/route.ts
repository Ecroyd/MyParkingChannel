// app/api/supplier/v1/bookings/[reference]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateSupplierApi,
  SupplierAuthError,
} from '@/lib/supplier/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> }
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

    const { reference: refParam } = await params;
    const reference = decodeURIComponent(refParam);
    const supabase = createAdminClient();

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

    // Optional: restrict partner to their own bookings:
    // .eq('source', auth.partnerName.toLowerCase()) in the select above.

    // Block cancellation after check-in
    if (existing.checked_in_at) {
      return NextResponse.json(
        {
          error: {
            code: 'BOOKING_IN_PROGRESS',
            message:
              'Booking has already checked in and can no longer be cancelled.',
          },
        },
        { status: 409 }
      );
    }

    if (existing.status === 'cancelled') {
      // Idempotent: already cancelled, just return current state
      return NextResponse.json(
        {
          reference: existing.reference,
          status: existing.status,
          start_at: existing.start_at,
          end_at: existing.end_at,
          customer: {
            name: existing.customer_name,
            email: existing.customer_email,
            phone: existing.customer_phone,
          },
          vehicle: {
            plate: existing.plate,
            make: existing.car_make,
            model: existing.car_model,
            colour: existing.car_color,
          },
          flight_number: existing.flight_number,
          notes: existing.notes,
          checked_in_at: existing.checked_in_at,
          checked_out_at: existing.checked_out_at,
        },
        { status: 200 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        notes: existing.notes
          ? `${existing.notes}\nCancelled via supplier API (${auth.partnerName})`
          : `Cancelled via supplier API (${auth.partnerName})`,
      })
      .eq('tenant_id', auth.tenantId)
      .eq('reference', reference)
      .select(
        'reference, status, start_at, end_at, customer_name, customer_email, customer_phone, plate, car_make, car_model, car_color, flight_number, notes, checked_in_at, checked_out_at'
      )
      .single();

    if (updateError || !updated) {
      console.error('Supplier cancel booking updateError', updateError);
      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to cancel booking',
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

    console.error('Supplier cancel booking error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
      { status: 500 }
    );
  }
}

