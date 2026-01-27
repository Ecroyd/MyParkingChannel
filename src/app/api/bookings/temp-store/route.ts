import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Get Supabase client with service role for server-side operations
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, reference, customerName, customerEmail, customerPhone, plate, flightNumber, startAt, endAt, amount } = await req.json();

    if (!tenantId || !reference) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // Store the booking data temporarily in Supabase
    // Using upsert to handle cases where the same reference is used multiple times
    const { error } = await supabase
      .from('temp_booking_data')
      .upsert({
        id: `${tenantId}_${reference}`,
        tenant_id: tenantId,
        reference: reference,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        plate: plate,
        flight_number: flightNumber,
        start_at: startAt,
        end_at: endAt,
        amount: amount,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() // Expires in 1 hour
      }, {
        onConflict: 'id'
      });

    if (error) {
      console.error('Error storing temp booking:', error);
      return NextResponse.json({ error: 'Failed to store booking data' }, { status: 500 });
    }

    // Clean up old entries (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase
      .from('temp_booking_data')
      .delete()
      .lt('expires_at', oneHourAgo);

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

    const supabase = getSupabaseClient();
    const id = `${tenantId}_${reference}`;

    const { data, error } = await supabase
      .from('temp_booking_data')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Booking data not found' }, { status: 404 });
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      // Delete expired entry
      await supabase
        .from('temp_booking_data')
        .delete()
        .eq('id', id);
      return NextResponse.json({ error: 'Booking data expired' }, { status: 404 });
    }

    // Return the booking data in the expected format
    const bookingData = {
      tenantId: data.tenant_id,
      reference: data.reference,
      customerName: data.customer_name,
      customerEmail: data.customer_email,
      customerPhone: data.customer_phone,
      plate: data.plate,
      flightNumber: data.flight_number,
      startAt: data.start_at,
      endAt: data.end_at,
      amount: data.amount
    };

    return NextResponse.json({ success: true, data: bookingData });
  } catch (error: any) {
    console.error('Error retrieving temp booking:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
