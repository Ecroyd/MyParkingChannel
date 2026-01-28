import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { makeDedupeKey, checkDuplicateBooking } from '@/lib/bookings/dedupe';

export async function POST(req: NextRequest) {
  try {
    const { tenantId, reference, customerName, customerEmail, customerPhone, plate, startAt, endAt, amount, flightNumber } = await req.json();

    if (!tenantId || !reference || !customerName || !customerEmail || !plate || !startAt || !endAt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Normalize plate
    const normalizedPlate = plate ? plate.toUpperCase().replace(/\s+/g, '') : null;

    // Generate dedupe key and check for duplicates
    const dedupeKey = makeDedupeKey({
      reference: reference,
      plate: normalizedPlate,
      customer_email: customerEmail,
      start_at: startAt,
      end_at: endAt
    });

    // Check for duplicate booking
    if (dedupeKey) {
      const existing = await checkDuplicateBooking(admin, tenantId, dedupeKey);
      if (existing) {
        return NextResponse.json({ 
          success: true, 
          booking: { id: existing.id, reference: existing.reference },
          message: 'Booking already exists',
          duplicate: true
        });
      }
    }

    // Create the booking
    const bookingData = {
      tenant_id: tenantId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      plate: normalizedPlate,
      flight_number: flightNumber || null,
      start_at: startAt,
      end_at: endAt,
      status: 'reserved',
      source: 'direct',
      money_received: amount || 0,
      money_charged: amount || 0,
      reference: reference,
      dedupe_key: dedupeKey
    };

    const { data: booking, error } = await admin
      .from('bookings')
      .insert(bookingData)
      .select('id, reference, customer_name, customer_email, plate, start_at, end_at, money_charged')
      .single();

    // Handle potential duplicate key error gracefully
    if (error) {
      // If it's a unique constraint violation, try to fetch the existing booking
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        if (dedupeKey) {
          const existing = await checkDuplicateBooking(admin, tenantId, dedupeKey);
          if (existing) {
            return NextResponse.json({ 
              success: true, 
              booking: { id: existing.id, reference: existing.reference },
              message: 'Booking already exists',
              duplicate: true
            });
          }
        }
      }
      console.error('Failed to create booking:', error);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    // Queue booking confirmation email
    if (booking && customerEmail) {
      try {
        const { queueEmail } = await import('@/lib/email/emailService');
        const { data: tenant } = await admin
          .from('tenants')
          .select('name, slug')
          .eq('id', tenantId)
          .single();

        await queueEmail({
          tenantId,
          to: customerEmail,
          toName: customerName,
          subject: `Booking Confirmed - ${booking.reference}`,
          templateKey: 'booking_confirmation',
          payload: {
            bookingReference: booking.reference,
            customerName,
            customerEmail,
            plate: normalizedPlate || '',
            startAt: startAt,
            endAt: endAt,
            amount: booking.money_charged || amount || 0,
            currency: 'GBP',
            tenantName: tenant?.name,
            tenantSlug: tenant?.slug,
          },
          dedupeKey: `booking:${booking.id}:confirmation:v1`,
        });
      } catch (emailError) {
        console.error('[BOOKING CREATE] Failed to queue confirmation email:', emailError);
        // Don't fail the booking creation if email fails
      }
    }

    return NextResponse.json({ success: true, booking });
  } catch (error: any) {
    console.error('Error creating booking from payment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
