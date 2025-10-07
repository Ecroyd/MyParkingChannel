import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const tenantId = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      console.error('Stripe OAuth Error:', error);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?error=stripe_connection_failed`);
    }

    if (!code || !tenantId) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?error=missing_parameters`);
    }

    // Initialize Stripe with platform secret key
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });

    // Exchange code for access token
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });

    // Get account details
    const account = await stripe.accounts.retrieve(response.stripe_user_id);

    // Store connection details in database
    const adminClient = await createAdminClient();
    
    // Store basic connection info in tenant_stripe
    const { error: stripeError } = await adminClient
      .from('tenant_stripe')
      .upsert({
        tenant_id: tenantId,
        stripe_account_id: response.stripe_user_id,
        stripe_publishable_key: account.publishable_key,
        stripe_secret_key: response.access_token, // Store directly in tenant_stripe
        connected: true,
      });

    if (stripeError) {
      console.error('Database Error:', stripeError);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?error=database_error`);
    }

    // Store webhook secret in tenant_secrets using your existing structure
    const { error: secretError } = await adminClient
      .from('tenant_secrets')
      .upsert({
        tenant_id: tenantId,
        scope: 'stripe',
        key: 'webhook_secret',
        value_ciphertext: '', // Will be set when webhook is configured
        updated_by: null,
      });

    if (secretError) {
      console.error('Secrets Error:', secretError);
      // Don't fail the connection for this, just log it
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?success=stripe_connected&tenant=${tenantId}`);
  } catch (error: any) {
    console.error('Stripe Callback Error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?error=callback_failed`);
  }
}
