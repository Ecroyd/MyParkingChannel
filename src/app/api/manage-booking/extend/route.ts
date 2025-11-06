import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createServerClientDirect } from '@/lib/supabase/server-direct';
import { quoteExtensionCents } from '@/lib/pricing/quoteExtension';

const COOKIE_NAME = 'booking_session';
const secret = new TextEncoder().encode(process.env.BOOKING_SESSION_SECRET || 'change-me-in-env');

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME)?.value;
    
    if (!cookie) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const { payload } = await jwtVerify(cookie, secret);
    const booking_id = payload['booking_id'] as string;
    const tenant_id = payload['tenant_id'] as string;
    const reference = payload['reference'] as string;

    const { newEndAt } = await req.json();

    if (!newEndAt) {
      return NextResponse.json({ message: 'New end date is required.' }, { status: 400 });
    }

    const supabase = createServerClientDirect({ admin: true });

    // Get current booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, end_at, status')
      .eq('id', booking_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ message: 'Booking not found.' }, { status: 404 });
    }

    // Check if booking is cancelled
    if (booking.status === 'cancelled') {
      return NextResponse.json({ message: 'Cannot extend a cancelled booking.' }, { status: 400 });
    }

    const newEndDate = new Date(newEndAt);
    const currentEndDate = new Date(booking.end_at);

    // Validate new end date is after current end date
    if (newEndDate <= currentEndDate) {
      return NextResponse.json({ 
        message: 'New pick-up date must be after the current pick-up date.' 
      }, { status: 400 });
    }

    // Calculate extension cost (optional - you may want to handle payment separately)
    // For now, we'll just update the booking
    // In production, you'd want to create a payment intent first

    // Update booking end date
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({ end_at: newEndDate.toISOString() })
      .eq('id', booking_id)
      .eq('tenant_id', tenant_id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Extend booking error:', updateError);
      return NextResponse.json({ message: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: 'Booking extended successfully.',
      booking: updatedBooking
    });
  } catch (e: any) {
    console.error('Manage booking extend error:', e);
    return NextResponse.json({ message: e.message || 'Extend failed.' }, { status: 500 });
  }
}

