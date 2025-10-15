// app/api/payments/connect/status/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getAuthedUserTenantId, getTenantStripeAccountId, setTenantStripeAccountId, getServerSupabase } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Handle OAuth callback from Stripe
    if (code && state) {
      console.log('🔍 [PAYMENTS] Handling OAuth callback from Stripe');
      
      // Extract tenant_id from state parameter
      const [tenantId, mode] = state.split(':');
      if (!tenantId) {
        throw new Error('Invalid state parameter - missing tenant_id');
      }

      // Determine if this is test or live mode - respect STRIPE_MODE=test setting
      const forceTestMode = process.env.STRIPE_MODE === 'test';
      const isTest = forceTestMode || mode === 'test' || process.env.NODE_ENV !== 'production';
      
      console.log('🔍 [PAYMENTS CONNECT] Mode determination:', {
        forceTestMode,
        requestedMode: mode,
        NODE_ENV: process.env.NODE_ENV,
        STRIPE_MODE: process.env.STRIPE_MODE,
        finalIsTest: isTest
      });
      
      // Select the correct Stripe secret key
      const stripeSecret = isTest
        ? process.env.STRIPE_SECRET_KEY_TEST
        : process.env.STRIPE_SECRET_KEY_LIVE;

      if (!stripeSecret) {
        throw new Error(`Missing Stripe secret key for mode: ${isTest ? 'test' : 'live'}`);
      }

      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://connect.stripe.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_secret: stripeSecret,
          code,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        console.error('Stripe OAuth error:', tokenData);
        throw new Error(tokenData.error_description || 'OAuth failed');
      }

      const stripeAccountId = tokenData.stripe_user_id;
      console.log('🔍 [PAYMENTS] Connected account ID:', stripeAccountId);

      // Use admin client to update database
      const adminClient = createAdminClient();
      
      // Update tenant_stripe table
      const { error: dbError } = await adminClient
        .from('tenant_stripe')
        .upsert({
          tenant_id: tenantId,
          stripe_account_id: stripeAccountId,
          connected: true,
          updated_at: new Date().toISOString()
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save Stripe account to database');
      }

      // Redirect to success page
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_ROOT_URL}/admin/payments?connected=true`);
    }

    // Handle OAuth error
    if (error) {
      console.error('OAuth error:', error);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_ROOT_URL}/admin/payments?error=${error}`);
    }

    // Regular status check (no OAuth callback)
    const tenantId = await getAuthedUserTenantId();
    const { accountId, connected } = await getTenantStripeAccountId(tenantId);
    
    if (!accountId) {
      return NextResponse.json({ 
        connected: false, 
        error: 'No Stripe account found. Click "Connect Stripe" to create one.' 
      });
    }

    console.log(`Checking Stripe account: ${accountId} for tenant: ${tenantId}`);

    // Try to retrieve the account, handle errors gracefully
    let acc;
    try {
      acc = await stripe.accounts.retrieve(accountId);
    } catch (stripeError: any) {
      console.error('Stripe account retrieval error:', stripeError);
      
      // Handle invalid API key errors
      if (stripeError.type === 'StripeAuthenticationError' || stripeError.statusCode === 401) {
        return NextResponse.json({ 
          connected: false, 
          error: 'Invalid Stripe API key. Please check your environment variables. If you want to use test mode, set STRIPE_MODE=test in your environment.' 
        }, { status: 500 });
      }
      
      // If account doesn't exist or key doesn't have access, clear it from database
      if (stripeError.code === 'account_invalid' || stripeError.statusCode === 403) {
        // Clear the old account ID from database
        const supabase = await getServerSupabase();
        await supabase
          .from('tenant_stripe')
          .delete()
          .eq('tenant_id', tenantId);
          
        return NextResponse.json({ 
          connected: false, 
          error: 'Found old Stripe account from different environment. Please create a new connection.' 
        });
      }
      
      throw stripeError;
    }

    // Persist a pragmatic "connected" flag when fully ready
    const isConnected = !!(acc.charges_enabled && acc.payouts_enabled && acc.details_submitted);
    if (isConnected) await setTenantStripeAccountId(tenantId, accountId, true);

    return NextResponse.json({
      connected: isConnected,
      id: acc.id,
      charges_enabled: acc.charges_enabled,
      payouts_enabled: acc.payouts_enabled,
      details_submitted: acc.details_submitted,
      requirements: acc.requirements,
    });
  } catch (error: any) {
    console.error('Status check error:', error);
    return NextResponse.json({ 
      connected: false, 
      error: error.message || 'Failed to check Stripe status' 
    }, { status: 500 });
  }
}
