// app/api/stripe/webhook/route.ts
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getTempBooking } from '@/lib/bookings/tempBookingStore';

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing STRIPE_WEBHOOK_SECRET' }, { status: 500 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Direct charges live on the tenant's connected account; Stripe sets event.account for those.
  const connectedAccount = event.account ?? undefined;

  // Handle the event. Handlers throw on failures that a retry could fix; we then return 500
  // so Stripe redelivers the event instead of the booking being silently lost.
  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await handleCheckoutSessionCompleted(event.data.object, connectedAccount);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      case 'account.updated': {
        const account = event.data.object;
        console.log('Account updated:', account.id);
        // TODO: Update account status in your database
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[STRIPE WEBHOOK] ${event.type} ${event.id} failed; returning 500 so Stripe retries:`, err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Webhook handler functions
// We read tenant_id, temp_booking_id, reference from session.metadata only (never from success URL).
// Checkout routes set metadata + payment_intent_data.metadata so we never need to scrape URLs.
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session, connectedAccount?: string) {
  {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const tenantId = session.metadata?.tenant_id;
    const tempId = session.metadata?.temp_booking_id;
    const reference = session.metadata?.reference;

    if (!tenantId || !reference) {
      console.error('Checkout session missing metadata: tenant_id or reference', { tenantId, reference });
      return;
    }

    // Delayed payment methods complete the session before the money arrives; the booking is
    // created on checkout.session.async_payment_succeeded instead.
    if (session.payment_status === 'unpaid') {
      console.log('Checkout session completed but unpaid; waiting for async payment', session.id);
      return;
    }

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
    if (!paymentIntentId) {
      console.error('Checkout session has no payment_intent');
      return;
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(
      paymentIntentId,
      undefined,
      connectedAccount ? { stripeAccount: connectedAccount } : undefined
    );
    const piMetadata = paymentIntent.metadata || {};

    // Extension payment: update booking_extensions, do not create a booking
    if (piMetadata.kind === 'extension' && tempId) {
      const { error: extError } = await admin
        .from('booking_extensions')
        .update({
          stripe_payment_intent_id: paymentIntentId,
          stripe_payment_status: 'succeeded',
          charged_amount_cents: paymentIntent.amount,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId)
        .eq('booking_id', tempId)
        .eq('stripe_payment_status', 'pending');
      if (extError) throw new Error(`Failed to update booking_extensions: ${extError.message}`);
      return;
    }

    // Idempotency: if we already have a booking for this payment intent, skip (Stripe retries)
    const { data: existingByPi } = await admin
      .from('bookings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();

    if (existingByPi) {
      console.log('Booking already exists for this payment intent (idempotent), skipping', paymentIntentId);
      return;
    }

    const customerName = session.customer_details?.name || 'Customer';
    const customerEmail = session.customer_email || session.customer_details?.email || '';
    const customerPhone = session.customer_details?.phone || null;

    // Read directly from the DB (throws on DB errors so the event is retried).
    const storedBookingData = (await getTempBooking(tenantId, reference)) as Record<string, unknown> | null;

    const plate = (storedBookingData?.plate as string) || piMetadata.plate || 'UNKNOWN';
    const flightNumber = (storedBookingData?.flightNumber as string) || (piMetadata.flight_number as string) || null;
    const startAt = (storedBookingData?.startAt as string) || (piMetadata.start_at as string) || new Date().toISOString();
    const endAt = (storedBookingData?.endAt as string) || (piMetadata.end_at as string) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const finalCustomerName = (storedBookingData?.customerName as string) || (piMetadata.customer_name as string) || customerName;
    const finalCustomerEmail = (storedBookingData?.customerEmail as string) || (piMetadata.customer_email as string) || customerEmail;
    const finalCustomerPhone = (storedBookingData?.customerPhone as string) || (piMetadata.customer_phone as string) || customerPhone;

    const bookingData = {
      tenant_id: tenantId,
      customer_name: finalCustomerName,
      customer_email: finalCustomerEmail,
      customer_phone: finalCustomerPhone || null,
      plate: plate,
      flight_number: flightNumber,
      start_at: startAt,
      end_at: endAt,
      status: 'reserved',
      source: 'direct',
      money_received: paymentIntent.amount / 100,
      money_charged: paymentIntent.amount / 100,
      reference: reference,
      stripe_payment_intent_id: paymentIntentId,
      stripe_checkout_session_id: session.id,
    };

    const { data: booking, error } = await admin
      .from('bookings')
      .insert(bookingData)
      .select('id, reference, customer_name, customer_email, plate, start_at, end_at, money_charged')
      .single();

    if (error) {
      // A concurrent delivery of the same event may have inserted it first.
      const { data: raced } = await admin
        .from('bookings')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle();
      if (raced) return;
      throw new Error(`Failed to create booking ${reference} for paid ${paymentIntentId}: ${error.message}`);
    } else {
      console.log('Booking created successfully:', booking?.reference);
      
      // Queue customer confirmation + tenant notification
      if (booking) {
        try {
          const { queueBookingConfirmationEmails } = await import(
            '@/lib/email/bookingEmails'
          );
          await queueBookingConfirmationEmails({
            tenantId,
            bookingId: booking.id,
            bookingReference: booking.reference,
            customerName: finalCustomerName,
            customerEmail: finalCustomerEmail,
            customerPhone: finalCustomerPhone,
            plate: plate || '',
            flightNumber,
            startAt,
            endAt,
            amount: booking.money_charged || paymentIntent.amount / 100,
            currency: 'GBP',
            source: 'Website',
          });
        } catch (emailError) {
          console.error('[STRIPE WEBHOOK] Failed to queue booking emails:', emailError);
          // Don't fail the booking creation if email fails
        }
      }
    }
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: any) {
  // This is handled by checkout.session.completed, but we can add additional logic here if needed
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const tenantId = paymentIntent.metadata?.tenant_id;
    const reference = paymentIntent.metadata?.reference ?? paymentIntent.metadata?.booking_reference;

    if (!tenantId || !reference) {
      console.error('Missing metadata for failed payment');
      return;
    }

    // Update booking status to cancelled due to payment failure (only if booking exists)
    const { error } = await admin
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .eq('reference', reference)
      // Only the booking this PaymentIntent paid for. Extension payments reuse the parent
      // booking's reference, and a declined extension must not cancel the original booking.
      .eq('stripe_payment_intent_id', paymentIntent.id);

    if (error) {
      throw new Error(`Failed to update booking status for failed payment: ${error.message}`);
    }
  }
}