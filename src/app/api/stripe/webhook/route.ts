// app/api/stripe/webhook/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

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

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object);
      break;
    
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object);
      break;
    
    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object);
      break;
    
    case 'account.updated':
      const account = event.data.object;
      console.log('Account updated:', account.id);
      // TODO: Update account status in your database
      break;
    
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}

// Webhook handler functions
async function handleCheckoutSessionCompleted(session: any) {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get the payment intent to get the amount
    const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
    
    // Extract tenant ID from success URL
    const successUrl = session.success_url;
    const tenantMatch = successUrl.match(/tenant=([^&]+)/);
    const referenceMatch = successUrl.match(/reference=([^&]+)/);
    
    if (!tenantMatch || !referenceMatch) {
      console.error('Could not extract tenant ID or reference from success URL:', successUrl);
      return;
    }
    
    const tenantId = tenantMatch[1];
    const bookingReference = referenceMatch[1];

    // Get customer data from session
    const customerName = session.customer_details?.name || 'Customer';
    const customerEmail = session.customer_email || session.customer_details?.email || '';
    const customerPhone = session.customer_details?.phone || null;
    
    // Get metadata from payment intent (contains booking data)
    const metadata = paymentIntent.metadata || {};
    
    // Try to get stored booking data from temp-store
    let storedBookingData = null;
    try {
      const tempBookingResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002'}/api/bookings/temp-store?tenantId=${tenantId}&reference=${bookingReference}`);
      if (tempBookingResponse.ok) {
        const tempData = await tempBookingResponse.json();
        storedBookingData = tempData.data;
      }
    } catch (error) {
      console.error('Failed to retrieve stored booking data:', error);
    }

    // Use stored data, then fallback to Stripe metadata, then session data
    const plate = storedBookingData?.plate || metadata.plate || 'UNKNOWN';
    const flightNumber = storedBookingData?.flightNumber || null;
    const startAt = storedBookingData?.startAt || metadata.start_at || new Date().toISOString();
    const endAt = storedBookingData?.endAt || metadata.end_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const finalCustomerName = storedBookingData?.customerName || metadata.customer_name || customerName;
    const finalCustomerEmail = storedBookingData?.customerEmail || metadata.customer_email || customerEmail;
    const finalCustomerPhone = storedBookingData?.customerPhone || metadata.customer_phone || customerPhone;

    // Create the booking with payment information
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
      money_received: paymentIntent.amount / 100, // Convert from cents
      money_charged: paymentIntent.amount / 100,
      reference: bookingReference // Use the reference from the URL
    };

    // Check if booking already exists before creating
    const { data: existingBooking } = await admin
      .from('bookings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('reference', bookingReference)
      .single();

    if (existingBooking) {
      console.log('Booking already exists, skipping creation');
      return;
    }

    const { data: booking, error } = await admin
      .from('bookings')
      .insert(bookingData)
      .select('id, reference, customer_name, customer_email, plate, start_at, end_at, money_charged')
      .single();

    if (error) {
      console.error('Failed to create booking:', error);
    } else {
      console.log('Booking created successfully:', booking?.reference);
      
      // Queue booking confirmation email
      if (booking && finalCustomerEmail) {
        try {
          const { queueEmail } = await import('@/lib/email/emailService');
          const { data: tenant } = await admin
            .from('tenants')
            .select('name, slug')
            .eq('id', tenantId)
            .single();

          await queueEmail({
            tenantId,
            to: finalCustomerEmail,
            toName: finalCustomerName,
            subject: `Booking Confirmed - ${booking.reference}`,
            templateKey: 'booking_confirmation',
            payload: {
              bookingReference: booking.reference,
              customerName: finalCustomerName,
              customerEmail: finalCustomerEmail,
              plate: plate || '',
              startAt: startAt,
              endAt: endAt,
              amount: booking.money_charged || paymentIntent.amount / 100,
              currency: 'GBP',
              tenantName: tenant?.name,
              tenantSlug: tenant?.slug,
            },
            dedupeKey: `booking:${booking.id}:confirmation:v1`,
          });
        } catch (emailError) {
          console.error('[STRIPE WEBHOOK] Failed to queue confirmation email:', emailError);
          // Don't fail the booking creation if email fails
        }
      }
    }
  } catch (error) {
    console.error('Error handling checkout session completed:', error);
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: any) {
  // This is handled by checkout.session.completed, but we can add additional logic here if needed
}

async function handlePaymentIntentFailed(paymentIntent: any) {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const tenantId = paymentIntent.metadata?.tenant_id;
    const bookingReference = paymentIntent.metadata?.booking_reference;
    
    if (!tenantId || !bookingReference) {
      console.error('Missing metadata for failed payment');
      return;
    }

    // Update booking status to cancelled due to payment failure
    const { error } = await admin
      .from('bookings')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .eq('reference', bookingReference);

    if (error) {
      console.error('Failed to update booking status for failed payment:', error);
    }
  } catch (error) {
    console.error('Error handling payment intent failed:', error);
  }
}