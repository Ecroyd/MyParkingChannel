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
      const { CUSTOMER_EXTENSION_NOTE } = await import('@/lib/manageBooking/stayChange');
      const extensionId = piMetadata.extension_id || session.metadata?.extension_id;
      if (extensionId) {
        // Customer extension from manage-booking: mark paid and apply the new end_at.
        await applyPaidCustomerExtension(admin, {
          tenantId,
          bookingId: tempId,
          extensionId,
          paymentIntentId,
          amountCents: paymentIntent.amount,
        });
        return;
      }

      // Legacy/admin extension checkout (no extension_id): status update only.
      const { error: extError } = await admin
        .from('booking_extensions')
        .update({
          stripe_payment_intent_id: paymentIntentId,
          stripe_payment_status: 'succeeded',
          charged_amount_cents: paymentIntent.amount,
          // booking_extensions has no updated_at column (checked against the live schema)
        })
        .eq('tenant_id', tenantId)
        .eq('booking_id', tempId)
        .eq('stripe_payment_status', 'pending')
        // Leave customer manage-booking extensions alone: they are settled by their own payment.
        .neq('note', CUSTOMER_EXTENSION_NOTE);
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
/**
 * Extension branch helper: a customer paid for a manage-booking extension.
 * Idempotent: the pending -> succeeded transition on booking_extensions is the claim, so a
 * re-delivered event (or a concurrent delivery) cannot apply the money twice. If applying to
 * the booking fails, the claim is released and we throw so Stripe retries.
 */
async function applyPaidCustomerExtension(
  admin: import('@supabase/supabase-js').SupabaseClient,
  opts: { tenantId: string; bookingId: string; extensionId: string; paymentIntentId: string; amountCents: number }
) {
  const { tenantId, bookingId, extensionId, paymentIntentId, amountCents } = opts;
  const { resolveExtendedEndAt, addPenceToPounds } = await import('@/lib/manageBooking/stayChange');

  const { data: ext, error: extReadErr } = await admin
    .from('booking_extensions')
    .select('id, new_end_at, stripe_payment_status')
    .eq('id', extensionId)
    .eq('tenant_id', tenantId)
    .eq('booking_id', bookingId)
    .maybeSingle<{ id: string; new_end_at: string; stripe_payment_status: string | null }>();
  if (extReadErr) throw new Error(`Failed to read booking_extensions ${extensionId}: ${extReadErr.message}`);
  if (!ext) {
    console.error('[STRIPE WEBHOOK] Paid extension has no booking_extensions row', extensionId);
    return;
  }
  if (ext.stripe_payment_status === 'succeeded') {
    console.log('[STRIPE WEBHOOK] Extension already applied (idempotent), skipping', extensionId);
    return;
  }

  // Snapshot before the claim: the live DB may have a trigger on booking_extensions that
  // applies a succeeded extension to the booking itself (admin extend relies on one; it is not
  // in the repo). If the claim below changes the booking, the trigger did the work.
  const { data: before } = await admin
    .from('bookings')
    .select('end_at, money_charged, money_received')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle<{ end_at: string; money_charged: number | null; money_received: number | null }>();

  // Claim: only one delivery can move this row out of 'pending'.
  const { data: claimed, error: claimErr } = await admin.from('booking_extensions')
    .update({
      stripe_payment_intent_id: paymentIntentId,
      stripe_payment_status: 'succeeded',
      charged_amount_cents: amountCents,
      // No updated_at: booking_extensions has no such column. Flipping to 'succeeded' fires the
      // live trg_apply_booking_extension trigger, which extends end_at and adds the money.
    })
    .eq('id', extensionId)
    .eq('tenant_id', tenantId)
    .eq('stripe_payment_status', 'pending')
    .select('id');
  if (claimErr) throw new Error(`Failed to update booking_extensions: ${claimErr.message}`);
  if (!claimed || claimed.length === 0) {
    console.log('[STRIPE WEBHOOK] Extension claimed by another delivery or not pending, skipping', extensionId);
    return;
  }

  const releaseClaim = async () => {
    await admin.from('booking_extensions')
      .update({ stripe_payment_status: 'pending' })
      .eq('id', extensionId)
      .eq('stripe_payment_status', 'succeeded');
  };

  const { data: booking, error: bookingErr } = await admin
    .from('bookings')
    .select('id, end_at, money_charged, money_received')
    .eq('id', bookingId)
    .eq('tenant_id', tenantId)
    .maybeSingle<{ id: string; end_at: string; money_charged: number | null; money_received: number | null }>();
  if (bookingErr || !booking) {
    await releaseClaim();
    throw new Error(`Failed to load booking ${bookingId} for paid extension ${extensionId}: ${bookingErr?.message ?? 'not found'}`);
  }

  if (
    before &&
    (before.end_at !== booking.end_at ||
      before.money_charged !== booking.money_charged ||
      before.money_received !== booking.money_received)
  ) {
    console.log('[STRIPE WEBHOOK] Booking already updated by DB trigger for extension; not applying twice', extensionId);
    return;
  }

  // Never touch stripe_payment_intent_id on the parent booking: it identifies the original payment.
  const { error: applyErr } = await admin.from('bookings')
    .update({
      end_at: resolveExtendedEndAt(booking.end_at, ext.new_end_at),
      money_charged: addPenceToPounds(booking.money_charged, amountCents),
      money_received: addPenceToPounds(booking.money_received, amountCents),
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('tenant_id', tenantId);
  if (applyErr) {
    await releaseClaim();
    throw new Error(`Failed to apply paid extension ${extensionId} to booking ${bookingId}: ${applyErr.message}`);
  }

  console.log('[STRIPE WEBHOOK] Paid extension applied', extensionId);
}
