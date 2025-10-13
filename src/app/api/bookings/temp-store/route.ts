import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Temporary storage for booking data before Stripe payment
const tempBookings = new Map<string, any>();

export async function POST(req: NextRequest) {
  try {
    const { tenantId, reference, customerName, customerEmail, customerPhone, plate, flightNumber, startAt, endAt, amount } = await req.json();

    if (!tenantId || !reference) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Store the booking data temporarily
    const key = `${tenantId}_${reference}`;
    tempBookings.set(key, {
      tenantId,
      reference,
      customerName,
      customerEmail,
      customerPhone,
      plate,
      flightNumber,
      startAt,
      endAt,
      amount,
      timestamp: Date.now()
    });

    // Clean up old entries (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [k, v] of tempBookings.entries()) {
      if (v.timestamp < oneHourAgo) {
        tempBookings.delete(k);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error storing temp booking:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const reference = searchParams.get('reference');

    if (!tenantId || !reference) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const key = `${tenantId}_${reference}`;
    const bookingData = tempBookings.get(key);

    if (!bookingData) {
      return NextResponse.json({ error: 'Booking data not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: bookingData });
  } catch (error: any) {
    console.error('Error retrieving temp booking:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
