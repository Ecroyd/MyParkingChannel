// PATCH /api/anpr/events/[id]/resolve - Manually link an ANPR event to a booking
// Authenticated via user session (admin/owner role required)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Normalize plate: uppercase, remove non-alphanumeric
 */
function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { bookingId, correctedPlate } = body;

    if (!bookingId) {
      return NextResponse.json(
        { error: 'bookingId is required' },
        { status: 400 }
      );
    }

    // Fetch the event
    const { data: event, error: eventError } = await adminClient
      .from('anpr_events')
      .select('id, tenant_id, direction, event_at, plate_normalized')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Verify user has admin access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', event.tenant_id)
      .maybeSingle();

    if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
      return NextResponse.json(
        { error: 'Access denied. Admin role required.' },
        { status: 403 }
      );
    }

    // Fetch the booking
    const { data: booking, error: bookingError } = await adminClient
      .from('bookings')
      .select('id, tenant_id, plate, start_at, end_at, checked_in_at, checked_out_at, anpr_status')
      .eq('id', bookingId)
      .eq('tenant_id', event.tenant_id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: 'Booking not found or access denied' },
        { status: 404 }
      );
    }

    // Update event
    const eventAt = new Date(event.event_at);
    const eventUpdates: any = {
      booking_id: bookingId,
      status: correctedPlate ? 'corrected' : 'matched',
      corrected_by: user.id,
      corrected_at: new Date().toISOString(),
    };

    if (correctedPlate) {
      eventUpdates.corrected_plate = normalizePlate(correctedPlate);
    }

    const { error: updateEventError } = await adminClient
      .from('anpr_events')
      .update(eventUpdates)
      .eq('id', eventId);

    if (updateEventError) {
      console.error('[ANPR Events Resolve] Update event error:', updateEventError);
      return NextResponse.json(
        { error: 'Failed to update event' },
        { status: 500 }
      );
    }

    // Update booking based on direction
    const bookingUpdates: any = {};

    if (event.direction === 'in') {
      // Set arrival
      bookingUpdates.checked_in_at = eventAt.toISOString();
      bookingUpdates.anpr_status = 'on_site';
      // Clear departure if it was set
      if (booking.checked_out_at) {
        bookingUpdates.checked_out_at = null;
      }
    } else if (event.direction === 'out') {
      // Set departure
      bookingUpdates.checked_out_at = eventAt.toISOString();
      bookingUpdates.anpr_status = 'departed';
      // Ensure checked_in_at is set if missing
      if (!booking.checked_in_at) {
        bookingUpdates.checked_in_at = eventAt.toISOString();
      }
    }

    // Update booking if there are updates
    if (Object.keys(bookingUpdates).length > 0) {
      const { error: updateBookingError } = await adminClient
        .from('bookings')
        .update(bookingUpdates)
        .eq('id', bookingId)
        .eq('tenant_id', event.tenant_id);

      if (updateBookingError) {
        console.error('[ANPR Events Resolve] Update booking error:', updateBookingError);
        // Continue anyway - event is already updated
      }
    }

    return NextResponse.json({
      success: true,
      event_id: eventId,
      booking_id: bookingId,
      status: correctedPlate ? 'corrected' : 'matched',
    });
  } catch (error: any) {
    console.error('[ANPR Events Resolve] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


