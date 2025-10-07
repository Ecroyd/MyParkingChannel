import { NextResponse } from 'next/server';
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

    // Exchange code for access token using direct API call
    const tokenResponse = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_secret: process.env.STRIPE_SECRET_KEY!,
        code: code,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Stripe token exchange failed:', await tokenResponse.text());
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();
    const stripeAccountId = tokenData.stripe_user_id;
    const accessToken = tokenData.access_token;

    // Get account details using the access token
    const accountResponse = await fetch(`https://api.stripe.com/v1/accounts/${stripeAccountId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!accountResponse.ok) {
      console.error('Failed to fetch account details:', await accountResponse.text());
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?error=account_details_failed`);
    }

    const accountData = await accountResponse.json();

    // Store connection details in database
    const adminClient = await createAdminClient();
    
    // Store basic connection info in tenant_stripe
    const { error: stripeError } = await adminClient
      .from('tenant_stripe')
      .upsert({
        tenant_id: tenantId,
        stripe_account_id: stripeAccountId,
        stripe_publishable_key: accountData.publishable_key,
        stripe_secret_key: accessToken,
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