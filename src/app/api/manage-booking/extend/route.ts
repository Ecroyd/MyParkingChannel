import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { createServerClientDirect } from '@/lib/supabase/server-direct';
import { getBookingSessionSecret } from '@/lib/manageBooking/sessionSecret';
import { quoteStayChange, SOLD_OUT_MESSAGE } from '@/lib/manageBooking/quoteStayChange';
import {
  buildManageBookingReturnUrl,
  CUSTOMER_EXTENSION_NOTE,
  platformFeeCents,
} from '@/lib/manageBooking/stayChange';
import { stripe, useConnected, ROOT_URL } from '@/lib/stripe';
import { getTenantStripeAccountId } from '@/lib/supabase-server';
import { siteUrlForTenantSlug } from '@/lib/sites/domain';

const COOKIE_NAME = 'booking_session';

/**
 * Customer extends their stay (later pick-up).
 * - No extra charge: applied immediately.
 * - Extra charge: a pending booking_extensions row + Stripe Checkout Session on the tenant's
 *   connected account. The Stripe webhook applies the new end_at once payment succeeds.
 */
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

    const { newEndAt } = await req.json().catch(() => ({}));

    if (!newEndAt) {
      return NextResponse.json({ message: 'New end date is required.' }, { status: 400 });
    }

    const newEndDate = new Date(newEndAt);
    if (Number.isNaN(newEndDate.getTime())) {
      return NextResponse.json({ message: 'Please enter a valid pick-up date and time.' }, { status: 400 });
    }

    const supabase = createServerClientDirect({ admin: true });

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, reference, start_at, end_at, status')
      .eq('id', booking_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ message: 'Booking not found.' }, { status: 404 });
    }

    if (booking.status === 'cancelled') {
      return NextResponse.json({ message: 'Cannot extend a cancelled booking.' }, { status: 400 });
    }

    const currentEndDate = new Date(booking.end_at);
    if (newEndDate <= currentEndDate) {
      return NextResponse.json({
        message: 'New pick-up date must be after the current pick-up date.'
      }, { status: 400 });
    }
    const newEndISO = newEndDate.toISOString();

    // Price the difference server-side: (start → new end) minus (start → current end).
    const quote = await quoteStayChange({
      tenantId: tenant_id,
      reference: booking.reference,
      currentStartAt: booking.start_at,
      currentEndAt: booking.end_at,
      newStartAt: booking.start_at,
      newEndAt: newEndISO,
    });
    if (!quote.ok) {
      return NextResponse.json({ message: quote.message }, { status: 400 });
    }
    if (quote.soldOut) {
      return NextResponse.json({ message: SOLD_OUT_MESSAGE }, { status: 409 });
    }

    const differenceCents = quote.newPriceCents - quote.oldPriceCents;

    if (differenceCents <= 0) {
      // Nothing extra to pay (e.g. same price band): apply directly.
      const { data: updatedBooking, error: updateError } = await supabase
        .from('bookings')
        .update({ end_at: newEndISO })
        .eq('id', booking_id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .single();

      if (updateError) {
        console.error('[manage-booking/extend] update failed:', updateError.message);
        return NextResponse.json({ message: 'Unable to extend booking.' }, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        message: 'Booking extended successfully.',
        booking: updatedBooking,
      });
    }

    // Paid extension. Never fall back to free if the tenant cannot take card payments.
    const { accountId } = await getTenantStripeAccountId(tenant_id);
    if (!accountId) {
      return NextResponse.json({
        message: 'Online payment is not available for this car park, so extensions cannot be made here. Please contact the car park to extend your booking.',
      }, { status: 400 });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('slug')
      .eq('id', tenant_id)
      .maybeSingle();
    const fallbackUrl = tenant?.slug
      ? siteUrlForTenantSlug(tenant.slug, '/manage-booking')
      : `${ROOT_URL}/manage-booking`;

    const extensionId = crypto.randomUUID();
    const currency = quote.currency;

    const { error: insertErr } = await supabase.from('booking_extensions').insert({
      id: extensionId,
      tenant_id,
      booking_id: booking.id,
      prev_end_at: booking.end_at,
      new_end_at: newEndISO,
      quote_amount_cents: differenceCents,
      charged_amount_cents: 0,
      currency,
      note: CUSTOMER_EXTENSION_NOTE,
      stripe_payment_intent_id: null,
      stripe_payment_status: 'pending',
      created_at: new Date().toISOString(),
    });
    if (insertErr) {
      console.error('[manage-booking/extend] booking_extensions insert failed:', insertErr.message);
      return NextResponse.json({ message: 'Unable to start the extension payment. Please try again.' }, { status: 500 });
    }

    const returnUrl = (query: string) =>
      buildManageBookingReturnUrl({
        origin: req.headers.get('origin'),
        referer: req.headers.get('referer'),
        fallbackUrl,
        query,
      });

    // Metadata: kind='extension' routes the webhook to the extension branch. temp_booking_id
    // carries the parent booking id (as the admin extension flow does). The parent reference is
    // only in session metadata (the webhook requires it); it is deliberately NOT on the
    // PaymentIntent, and the parent's stripe_payment_intent_id is never overwritten.
    const metadata = {
      kind: 'extension',
      tenant_id,
      temp_booking_id: booking.id,
      booking_id: booking.id,
      extension_id: extensionId,
      new_end_at: newEndISO,
    };

    let session;
    try {
      session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [{
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: differenceCents,
              product_data: { name: `Parking extension (${booking.reference})` },
            },
            quantity: 1,
          }],
          metadata: { ...metadata, reference: booking.reference },
          payment_intent_data: {
            application_fee_amount: platformFeeCents(differenceCents),
            metadata,
          },
          success_url: returnUrl('extended=1'),
          cancel_url: returnUrl('extend_cancelled=1'),
        },
        useConnected(accountId),
      );
    } catch (e: any) {
      console.error('[manage-booking/extend] checkout session failed:', e?.message || e);
      await supabase
        .from('booking_extensions')
        .update({ stripe_payment_status: 'failed' })
        .eq('id', extensionId)
        .eq('stripe_payment_status', 'pending');
      return NextResponse.json({ message: 'Unable to start the extension payment. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      requiresPayment: true,
      checkoutUrl: session.url,
      amountCents: differenceCents,
      currency,
    });
  } catch (e: any) {
    console.error('Manage booking extend error:', e?.message || e);
    return NextResponse.json({ message: 'Extend failed.' }, { status: 500 });
  }
}
