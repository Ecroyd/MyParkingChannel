import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // Check if booking already exists
    const { data: existingBooking } = await admin
      .from('bookings')
      .select('id, reference, customer_name, status')
      .eq('tenant_id', tenantId)
      .eq('reference', reference)
      .single();

    if (existingBooking) {
      return NextResponse.json({ 
        success: true, 
        booking: existingBooking,
        message: 'Booking already exists'
      });
    }

    // Create the booking
    const bookingData = {
      tenant_id: tenantId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      plate: plate,
      flight_number: flightNumber || null,
      start_at: startAt,
      end_at: endAt,
      status: 'reserved',
      source: 'other',
      money_received: amount || 0,
      money_charged: amount || 0,
      reference: reference
    };


    const { data: booking, error } = await admin
      .from('bookings')
      .insert(bookingData)
      .select('id, reference')
      .single();

    if (error) {
      console.error('Failed to create booking:', error);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    return NextResponse.json({ success: true, booking });
  } catch (error: any) {
    console.error('Error creating booking from payment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
