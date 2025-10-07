import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function POST(req: Request) {
  try {
    const { tenantId, bookingId, amount, currency = 'gbp' } = await req.json();

    if (!tenantId || !bookingId || !amount) {
      return NextResponse.json({ 
        error: 'Missing required parameters: tenantId, bookingId, amount' 
      }, { status: 400 });
    }

    // Get tenant's Stripe connection
    const adminClient = await createAdminClient();
    const { data: tenantStripe, error: stripeError } = await adminClient
      .from('tenant_stripe')
      .select('stripe_account_id')
      .eq('tenant_id', tenantId)
      .eq('connected', true)
      .single();

    if (stripeError || !tenantStripe?.stripe_account_id) {
      return NextResponse.json({ 
        error: 'Tenant not connected to Stripe' 
      }, { status: 400 });
    }

    // Initialize Stripe with platform secret key
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });

    // Create checkout session that directs payment to tenant
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency,
              product_data: { 
                name: `Parking Booking ${bookingId}`,
                description: `Parking booking for ${bookingId}`
              },
              unit_amount: Math.round(amount * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/sites/${tenantId}/booking-success?ref=${bookingId}`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/sites/${tenantId}/booking-failed`,
        metadata: {
          tenant_id: tenantId,
          booking_id: bookingId,
        },
        // This ensures the payment goes directly to the tenant's account
        payment_intent_data: {
          metadata: {
            tenant_id: tenantId,
            booking_id: bookingId,
          },
        },
      },
      {
        // Use the tenant's Stripe account for the payment
        stripeAccount: tenantStripe.stripe_account_id,
      }
    );

    return NextResponse.json({ 
      url: session.url,
      session_id: session.id 
    });
  } catch (error: any) {
    console.error('Booking Payment Error:', error);
    return NextResponse.json({ 
      error: 'Failed to create payment session' 
    }, { status: 500 });
  }
}

