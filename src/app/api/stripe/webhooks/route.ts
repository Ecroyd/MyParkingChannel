import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature provided' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature using platform secret key
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        break;
      case 'charge.dispute.created':
        await handleChargeDispute(event.data.object as Stripe.Dispute);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  try {
    // Extract tenant_id from metadata
    const tenantId = paymentIntent.metadata?.tenant_id;
    
    if (!tenantId) {
      console.error('No tenant_id found in payment intent metadata');
      return;
    }

    // Get tenant's Stripe connection
    const adminClient = await createAdminClient();
    const { data: stripeConnection } = await adminClient
      .from('tenant_stripe')
      .select('stripe_account_id')
      .eq('tenant_id', tenantId)
      .single();

    if (!stripeConnection) {
      console.error('No Stripe connection found for tenant:', tenantId);
      return;
    }

    // Update booking status in database
    const { error: updateError } = await adminClient
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_intent_id: paymentIntent.id,
        money_received: paymentIntent.amount / 100, // Convert from cents
        updated_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', paymentIntent.id);

    if (updateError) {
      console.error('Failed to update booking:', updateError);
    }

    console.log(`Payment succeeded for tenant ${tenantId}: ${paymentIntent.id}`);
  } catch (error) {
    console.error('Error handling payment intent succeeded:', error);
  }
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
  try {
    const tenantId = paymentIntent.metadata?.tenant_id;
    
    if (!tenantId) {
      console.error('No tenant_id found in payment intent metadata');
      return;
    }

    // Update booking status to failed
    const adminClient = await createAdminClient();
    const { error: updateError } = await adminClient
      .from('bookings')
      .update({
        status: 'payment_failed',
        updated_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', paymentIntent.id);

    if (updateError) {
      console.error('Failed to update booking status:', updateError);
    }

    console.log(`Payment failed for tenant ${tenantId}: ${paymentIntent.id}`);
  } catch (error) {
    console.error('Error handling payment intent failed:', error);
  }
}

async function handleChargeDispute(dispute: Stripe.Dispute) {
  try {
    // Get the charge to find the payment intent
    const charge = await stripe.charges.retrieve(dispute.charge as string);
    const paymentIntentId = charge.payment_intent as string;
    
    // Get booking from payment intent metadata
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const tenantId = paymentIntent.metadata?.tenant_id;
    
    if (!tenantId) {
      console.error('No tenant_id found in payment intent metadata');
      return;
    }

    // Update booking status to disputed
    const adminClient = await createAdminClient();
    const { error: updateError } = await adminClient
      .from('bookings')
      .update({
        status: 'disputed',
        updated_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', paymentIntentId);

    if (updateError) {
      console.error('Failed to update booking status:', updateError);
    }

    console.log(`Dispute created for tenant ${tenantId}: ${dispute.id}`);
  } catch (error) {
    console.error('Error handling charge dispute:', error);
  }
}
