import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createServerClientDirect } from '@/lib/supabase/server-direct';
import { createAdminClient } from '@/lib/supabase/server';

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

    // Sync to Videofit if configured (fire and forget)
    if (updatedBooking) {
      const { syncBookingToVideofit } = await import('@/lib/videofit/bookingSync');
      const adminClient = createAdminClient();
      void syncBookingToVideofit(
        {
          id: updatedBooking.id,
          tenant_id: updatedBooking.tenant_id,
          plate: updatedBooking.plate,
          start_at: updatedBooking.start_at,
          end_at: updatedBooking.end_at,
          status: 'cancelled',
        },
        'cancelled',
        adminClient
      ).catch((err) => console.error('[Videofit] Background sync error:', err));

      // Queue cancellation email
      if (updatedBooking.customer_email) {
        try {
          const { queueEmail } = await import('@/lib/email/emailService');
          const { data: tenant } = await adminClient
            .from('tenants')
            .select('name')
            .eq('id', updatedBooking.tenant_id)
            .single();

          await queueEmail({
            tenantId: updatedBooking.tenant_id,
            to: updatedBooking.customer_email,
            toName: updatedBooking.customer_name || null,
            subject: `Booking Cancelled - ${updatedBooking.reference}`,
            templateKey: 'booking_cancelled',
            payload: {
              bookingReference: updatedBooking.reference,
              customerName: updatedBooking.customer_name || 'Customer',
              plate: updatedBooking.plate || '',
              startAt: updatedBooking.start_at,
              endAt: updatedBooking.end_at,
              refundAmount: updatedBooking.money_received || 0,
              currency: 'GBP',
              tenantName: tenant?.name,
            },
            dedupeKey: `booking:${updatedBooking.id}:cancel:v1`,
          });
        } catch (emailError) {
          console.error('[BOOKING CANCEL] Failed to queue cancellation email:', emailError);
          // Don't fail the cancellation if email fails
        }
      }
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

