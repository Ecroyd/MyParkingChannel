// src/app/api/internal/suppliers/cavu/sync-booking/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getBookingDetails } from '@/lib/suppliers/cavu';

export async function POST(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const reference = req.nextUrl.searchParams.get('reference');

  if (!tenantId || !reference) {
    return NextResponse.json(
      { ok: false, error: 'Missing tenantId or reference' },
      { status: 400 }
    );
  }

  try {
    // Load CAVU config for tenant
    const config = await getCavuConfigForTenant(tenantId);
    if (!config) {
      return NextResponse.json(
        { ok: false, error: 'No CAVU config for tenant' },
        { status: 400 }
      );
    }

    // Fetch booking details from CAVU
    const booking = await getBookingDetails(config, reference);
    if (!booking) {
      return NextResponse.json(
        { ok: false, error: 'Booking not found in CAVU' },
        { status: 404 }
      );
    }

    // Map customer name from nested structure
    const customerFirst = booking.Customer?.FirstName ?? '';
    const customerLast = booking.Customer?.Surname ?? '';
    const customerNameRaw = `${customerFirst} ${customerLast}`.trim();
    const customerName = customerNameRaw || 'Unknown';

    // Normalize plate: uppercase, remove spaces
    const plateRaw = booking.Vehicle?.Registration ?? '';
    const plateNorm = plateRaw.replace(/\s+/g, '').toUpperCase();
    const plate = plateNorm || 'UNKNOWN';

    // Map status from CAVU Status
    function mapCavuStatus(status?: string): 'reserved' | 'checked_in' | 'checked_out' | 'cancelled' {
      if (!status) return 'reserved';
      const upper = status.toUpperCase();
      if (upper.includes('CANCELLED') || upper.includes('CANCEL')) return 'cancelled';
      if (upper.includes('CHECKED_OUT') || upper.includes('DEPARTED') || upper.includes('OUT')) return 'checked_out';
      if (upper.includes('CHECKED_IN') || upper.includes('ARRIVED') || upper.includes('IN')) return 'checked_in';
      if (upper.includes('CONFIRMED') || upper.includes('RESERVED')) return 'reserved';
      return 'reserved'; // Default
    }

    // Extract flight_date from ArrivalDate (YYYY-MM-DD format)
    const flightDate = booking.ArrivalDate ? booking.ArrivalDate.slice(0, 10) : null;

    // Compute missing fields
    const missingFields: string[] = [];
    if (!customerName || customerName === 'Unknown') {
      missingFields.push('customer_name');
    }
    if (!plate || plate === 'UNKNOWN' || plate === '') {
      missingFields.push('plate');
    }
    if (!booking.Customer?.Email || booking.Customer.Email.trim() === '') {
      missingFields.push('customer_email');
    }
    if (!booking.ArrivalDate || booking.ArrivalDate.trim() === '') {
      missingFields.push('start_at');
    }
    if (!booking.DepartureDate || booking.DepartureDate.trim() === '') {
      missingFields.push('end_at');
    }

    const isIncomplete = missingFields.length > 0;

    // Upsert booking into database
    const supabase = createAdminClient();
    const row = {
      tenant_id: tenantId,
      reference: booking.Reference,
      start_at: booking.ArrivalDate,
      end_at: booking.DepartureDate,
      customer_name: customerName,
      customer_email: booking.Customer?.Email ?? null,
      customer_phone: booking.Customer?.Mobile ?? null,
      plate: plate,
      car_make: booking.Vehicle?.Make ?? null,
      car_model: booking.Vehicle?.Model ?? null,
      car_color: booking.Vehicle?.Colour ?? null,
      flight_number: booking.OutboundFlight ?? null,
      return_flight_number: booking.ReturnFlight ?? null,
      returning_from: booking.ReturningFrom ?? null,
      outbound_terminal: booking.OutboundTerminal ?? null,
      return_terminal: booking.ReturnTerminal ?? null,
      flight_date: flightDate,
      source: 'cavu',
      status: mapCavuStatus(booking.Status),
      money_received: booking.AmountPaid ?? 0,
      money_charged: booking.AmountPaid ?? 0,
      notes: booking.SpecialRequests ?? null,
      is_incomplete: isIncomplete,
      missing_fields: missingFields,
    };

    const { data: upsertedBooking, error } = await supabase
      .from('bookings')
      .upsert(row as any, {
        onConflict: 'tenant_id,reference',
      } as any)
      .select('id, tenant_id, reference')
      .single();

    if (error) {
      console.error('[CAVU SYNC BOOKING] Upsert failed', error);
      return NextResponse.json(
        { ok: false, error: `Failed to upsert booking: ${error.message}` },
        { status: 500 }
      );
    }

    // Save full booking payload to booking_external_payloads
    if (upsertedBooking?.id) {
      const { error: payloadError } = await supabase
        .from('booking_external_payloads')
        .upsert({
          tenant_id: upsertedBooking.tenant_id,
          booking_id: upsertedBooking.id,
          source: 'cavu',
          reference: upsertedBooking.reference,
          payload: booking as any,
          fetched_at: new Date().toISOString(),
        } as any, {
          onConflict: 'tenant_id,source,reference',
        } as any);

      if (payloadError) {
        console.warn('[CAVU SYNC BOOKING] Failed to save payload:', payloadError.message);
        // Don't fail the request if payload save fails
      }
    }

    return NextResponse.json({
      ok: true,
      reference,
      updated: true,
    });
  } catch (err: any) {
    console.error('[CAVU SYNC BOOKING] error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

