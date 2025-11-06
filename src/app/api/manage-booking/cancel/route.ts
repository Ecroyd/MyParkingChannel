import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createServerClientDirect } from '@/lib/supabase/server-direct';

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

    const supabase = createServerClientDirect({ admin: true });

    // Check booking source - only allow cancel for direct/manual bookings
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, source, status')
      .eq('id', booking_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ message: 'Booking not found.' }, { status: 404 });
    }

    // Only allow cancellation for direct/manual bookings
    if (booking.source !== 'direct' && booking.source !== 'manual') {
      return NextResponse.json({ 
        message: 'This booking was made through an external channel. Please cancel through the original booking channel.' 
      }, { status: 403 });
    }

    // Check if already cancelled
    if (booking.status === 'cancelled') {
      return NextResponse.json({ message: 'Booking is already cancelled.' }, { status: 400 });
    }

    // Update booking status to cancelled
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking_id)
      .eq('tenant_id', tenant_id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Cancel booking error:', updateError);
      return NextResponse.json({ message: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: 'Booking cancelled successfully.',
      booking: updatedBooking
    });
  } catch (e: any) {
    console.error('Manage booking cancel error:', e);
    return NextResponse.json({ message: e.message || 'Cancel failed.' }, { status: 500 });
  }
}

