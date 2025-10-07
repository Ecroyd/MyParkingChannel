import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server-admin';

interface CreatePaymentIntentParams {
  tenantId: string;
  amount: number; // in cents
  currency: string;
  bookingId: string;
  customerEmail?: string;
  description?: string;
}

export async function createTenantPaymentIntent({
  tenantId,
  amount,
  currency,
  bookingId,
  customerEmail,
  description,
}: CreatePaymentIntentParams) {
  try {
    // Get tenant's Stripe connection
    const adminClient = await createAdminClient();
    const { data: stripeConnection, error: connectionError } = await adminClient
      .from('tenant_stripe')
      .select('stripe_account_id')
      .eq('tenant_id', tenantId)
      .eq('connected', true)
      .single();

    if (connectionError || !stripeConnection) {
      throw new Error('No active Stripe connection found for tenant');
    }

    // Get tenant's secret key
    const { data: secretData, error: secretError } = await adminClient
      .from('tenant_secrets')
      .select('secret_value')
      .eq('tenant_id', tenantId)
      .eq('secret_name', 'stripe_secret_key')
      .single();

    if (secretError || !secretData) {
      throw new Error('Stripe secret key not found for tenant');
    }

    // Initialize Stripe with tenant's secret key
    const stripe = new Stripe(secretData.secret_value, {
      apiVersion: '2023-10-16',
    });

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      description,
      metadata: {
        tenant_id: tenantId,
        booking_id: bookingId,
      },
      customer_email: customerEmail,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return paymentIntent;
  } catch (error: any) {
    console.error('Error creating tenant payment intent:', error);
    throw error;
  }
}

export async function getTenantStripeAccount(tenantId: string) {
  try {
    const adminClient = await createAdminClient();
    const { data: stripeConnection, error } = await adminClient
      .from('tenant_stripe')
      .select('stripe_account_id, stripe_publishable_key, connected')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !stripeConnection?.connected) {
      throw new Error('No active Stripe connection found');
    }

    return stripeConnection;
  } catch (error: any) {
    console.error('Error getting tenant Stripe account:', error);
    throw error;
  }
}

export async function createTenantRefund({
  tenantId,
  paymentIntentId,
  amount,
  reason,
}: {
  tenantId: string;
  paymentIntentId: string;
  amount?: number;
  reason?: string;
}) {
  try {
    // Get tenant's secret key
    const adminClient = await createAdminClient();
    const { data: secretData, error: secretError } = await adminClient
      .from('tenant_secrets')
      .select('secret_value')
      .eq('tenant_id', tenantId)
      .eq('secret_name', 'stripe_secret_key')
      .single();

    if (secretError || !secretData) {
      throw new Error('Stripe secret key not found for tenant');
    }

    // Initialize Stripe with tenant's secret key
    const stripe = new Stripe(secretData.secret_value, {
      apiVersion: '2023-10-16',
    });

    // Create refund
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount,
      reason: reason as any,
    });

    return refund;
  } catch (error: any) {
    console.error('Error creating tenant refund:', error);
    throw error;
  }
}
