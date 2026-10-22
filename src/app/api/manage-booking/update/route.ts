import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createServerClientDirect } from '@/lib/supabase/server-direct';
import { getBookingSessionSecret } from '@/lib/manageBooking/sessionSecret';
import { classifyDateChange } from '@/lib/manageBooking/stayChange';
import { quoteStayChange, SOLD_OUT_MESSAGE } from '@/lib/manageBooking/quoteStayChange';

const COOKIE_NAME = 'booking_session';

// whitelist keys customers are allowed to change
// Note: start_at and end_at are only allowed for direct/manual bookings (checked in handler)
const ALLOWED: Record<string, true> = {
  plate: true,
  car_make: true,
  car_model: true,
  car_color: true,
  customer_email: true,
  flight_number: true,
  start_at: true,
  end_at: true,
};

const NEEDS_PAYMENT_MESSAGE =
  'Those dates cost more than your current booking, so they can\'t be changed here. To keep your car with us for longer, use "Extend booking" and pay the difference.';

type DateRefusal = { status: number; message: string };

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME)?.value;

    if (!cookie) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    let payload: Record<string, unknown>;
    try {
      ({ payload } = await jwtVerify(cookie, getBookingSessionSecret()));
    } catch {
      return NextResponse.json({ message: 'Your session has expired. Please find your booking again.' }, { status: 401 });
    }
    const booking_id = payload['booking_id'] as string;
    const tenant_id = payload['tenant_id'] as string;
    const reference = payload['reference'] as string;

    const { changes } = await req.json().catch(() => ({}));

    if (!changes || typeof changes !== 'object') {
      return NextResponse.json({ message: 'No changes provided.' }, { status: 400 });
    }

    // filter to allowed fields only
    const allowedChanges: Record<string, any> = {};
    Object.keys(changes).forEach((k) => {
      if (ALLOWED[k]) allowedChanges[k] = changes[k];
    });

    if (Object.keys(allowedChanges).length === 0) {
      return NextResponse.json({ message: 'Nothing to update.' }, { status: 400 });
    }

    const supabase = createServerClientDirect({ admin: true });

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, source, reference, start_at, end_at, status')
      .eq('id', booking_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ message: 'Booking not found.' }, { status: 404 });
    }

    const isDirectBooking = booking.source === 'direct' || booking.source === 'manual';

    // Remove date changes if not direct/manual booking
    if (!isDirectBooking) {
      delete allowedChanges.start_at;
      delete allowedChanges.end_at;
      // Also remove customer_email for channel bookings
      delete allowedChanges.customer_email;
    }

    // ---- Date changes. Only free-of-charge moves (same or lower price, capacity permitting)
    // are applied here; anything that costs more must go through the paid Extend flow.
    const requestedStart = allowedChanges.start_at ? String(allowedChanges.start_at) : null;
    const requestedEnd = allowedChanges.end_at ? String(allowedChanges.end_at) : null;
    delete allowedChanges.start_at;
    delete allowedChanges.end_at;

    let dateUpdate: { start_at: string; end_at: string } | null = null;
    let dateRefusal: DateRefusal | null = null;

    if (requestedStart || requestedEnd) {
      const newStartAt = requestedStart ?? booking.start_at;
      const newEndAt = requestedEnd ?? booking.end_at;
      const base = {
        currentStartAt: booking.start_at,
        currentEndAt: booking.end_at,
        newStartAt,
        newEndAt,
      };
      const first = classifyDateChange(base);

      if (first.kind === 'invalid') {
        dateRefusal = { status: 400, message: first.message };
      } else if (first.kind === 'needs_quote') {
        if (booking.status === 'cancelled') {
          dateRefusal = { status: 400, message: 'Dates cannot be changed on a cancelled booking.' };
        } else {
          const quote = await quoteStayChange({
            tenantId: tenant_id,
            reference: booking.reference,
            ...base,
          });
          if (!quote.ok) {
            dateRefusal = { status: 400, message: quote.message };
          } else if (quote.soldOut) {
            dateRefusal = { status: 409, message: SOLD_OUT_MESSAGE };
          } else {
            const decision = classifyDateChange({
              ...base,
              oldPriceCents: quote.oldPriceCents,
              newPriceCents: quote.newPriceCents,
            });
            if (decision.kind === 'free') {
              dateUpdate = {
                start_at: new Date(newStartAt).toISOString(),
                end_at: new Date(newEndAt).toISOString(),
              };
            } else {
              dateRefusal = { status: 409, message: NEEDS_PAYMENT_MESSAGE };
            }
          }
        }
      }
      // 'unchanged': the form always re-sends the current dates; nothing to do.
    }

    // ---- Non-date fields (vehicle / contact / flight): unchanged behaviour.
    const hasFieldChanges = Object.keys(allowedChanges).length > 0;
    let fieldsMessage: string | null = null;

    if (hasFieldChanges) {
      // Try RPC function first, fallback to direct update if RPC doesn't exist
      const { data: rpcResult, error: rpcError } = await supabase.rpc('update_customer_booking', {
        p_tenant_id: tenant_id,
        p_reference: reference,
        p_plate: allowedChanges.plate || null,
        p_car_make: allowedChanges.car_make || null,
        p_car_model: allowedChanges.car_model || null,
        p_car_color: allowedChanges.car_color || null,
        p_flight_number: allowedChanges.flight_number || null,
        p_last_name: null, // Not provided in the form
        p_notes: null, // Not provided in the form
      });

      if (rpcError) {
        // Fallback to direct table update
        const { error: updateError } = await supabase
          .from('bookings')
          .update(allowedChanges)
          .eq('id', booking_id)
          .eq('tenant_id', tenant_id);

        if (updateError) {
          console.error('[manage-booking/update] direct update failed:', updateError.message);
          return NextResponse.json({ message: 'Unable to save changes.' }, { status: 400 });
        }
      } else if (rpcResult && !rpcResult.success) {
        console.error('[manage-booking/update] RPC returned error');
        return NextResponse.json({ message: rpcResult.error || 'Unable to save changes.' }, { status: 400 });
      } else {
        fieldsMessage = rpcResult?.message || null;
      }
    }

    // ---- Apply an approved free date change.
    if (dateUpdate) {
      const { error: dateErr } = await supabase
        .from('bookings')
        .update(dateUpdate)
        .eq('id', booking_id)
        .eq('tenant_id', tenant_id);
      if (dateErr) {
        console.error('[manage-booking/update] date update failed:', dateErr.message);
        return NextResponse.json({
          message: hasFieldChanges
            ? 'Your other details were saved, but we could not change your dates. Please try again.'
            : 'Unable to change your dates. Please try again.',
        }, { status: 400 });
      }
    }

    if (dateRefusal) {
      return NextResponse.json({
        ok: false,
        dateChangeRefused: true,
        fieldsSaved: hasFieldChanges,
        message: hasFieldChanges
          ? `Your other details were saved. ${dateRefusal.message}`
          : dateRefusal.message,
      }, { status: dateRefusal.status });
    }

    if (!hasFieldChanges && !dateUpdate) {
      return NextResponse.json({ ok: true, message: 'No changes to save.' });
    }

    return NextResponse.json({
      ok: true,
      message: fieldsMessage || 'Booking updated successfully',
    });
  } catch (e: any) {
    console.error('Manage booking update error:', e?.message || e);
    return NextResponse.json({ message: 'Update failed.' }, { status: 500 });
  }
}
