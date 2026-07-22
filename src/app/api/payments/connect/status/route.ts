// app/api/payments/connect/status/route.ts
import { NextResponse } from 'next/server';
import { stripe, ROOT_URL } from '@/lib/stripe';
import { getAuthedUserTenantId, getTenantStripeAccountId, setTenantStripeAccountId, getServerSupabase } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';

function resolveConnectMode(requestedMode: string | undefined): 'test' | 'live' {
  // Explicit platform force-test always wins
  if (process.env.STRIPE_MODE === 'test') return 'test';
  // Honor the mode encoded in OAuth state (tenant chose Live or Test in UI)
  if (requestedMode === 'live') return 'live';
  if (requestedMode === 'test') return 'test';
  // Default: live in production, test elsewhere
  return process.env.NODE_ENV === 'production' ? 'live' : 'test';
}

function platformMode(): 'test' | 'live' {
  if (process.env.STRIPE_MODE === 'test') return 'test';
  return process.env.NODE_ENV === 'production' ? 'live' : 'test';
}

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
      const [tenantId, requestedMode] = state.split(':');
      if (!tenantId) {
        throw new Error('Invalid state parameter - missing tenant_id');
      }

      const connectMode = resolveConnectMode(requestedMode);
      const isTest = connectMode === 'test';
      
      console.log('🔍 [PAYMENTS CONNECT] Mode determination:', {
        forceTestMode: process.env.STRIPE_MODE === 'test',
        requestedMode,
        NODE_ENV: process.env.NODE_ENV,
        STRIPE_MODE: process.env.STRIPE_MODE,
        connectMode,
      });
      
      // Select the correct Stripe secret key for the Connect mode being linked
      const stripeSecret = isTest
        ? (process.env.STRIPE_SECRET_KEY_TEST ?? (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? process.env.STRIPE_SECRET_KEY : undefined))
        : (process.env.STRIPE_SECRET_KEY_LIVE ?? (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? process.env.STRIPE_SECRET_KEY : undefined));

      if (!stripeSecret) {
        throw new Error(`Missing Stripe secret key for mode: ${connectMode}`);
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
      console.log('🔍 [PAYMENTS] Connected account ID:', stripeAccountId, 'mode:', connectMode);

      // Use admin client to update database
      const adminClient = createAdminClient();
      
      // Update tenant_stripe table — persist Connect mode
      const { error: dbError } = await adminClient
        .from('tenant_stripe')
        .upsert({
          tenant_id: tenantId,
          stripe_account_id: stripeAccountId,
          connected: true,
          mode: connectMode,
          updated_at: new Date().toISOString()
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save Stripe account to database');
      }

      // Redirect to success page
      const root = process.env.NEXT_PUBLIC_ROOT_URL || ROOT_URL;
      return NextResponse.redirect(`${root}/admin/payments?connected=true&mode=${connectMode}`);
    }

    // Handle OAuth error
    if (error) {
      console.error('OAuth error:', error);
      const root = process.env.NEXT_PUBLIC_ROOT_URL || ROOT_URL;
      return NextResponse.redirect(`${root}/admin/payments?error=${error}`);
    }

    // Regular status check (no OAuth callback)
    const tenantId = await getAuthedUserTenantId();
    const { accountId, connected, mode: storedMode } = await getTenantStripeAccountId(tenantId);
    const currentPlatformMode = platformMode();
    
    if (!accountId) {
      return NextResponse.json({ 
        connected: false,
        mode: null,
        platformMode: currentPlatformMode,
        error: 'No Stripe account found. Click "Connect Stripe" to create one.' 
      });
    }

    console.log(`Checking Stripe account: ${accountId} for tenant: ${tenantId} (storedMode=${storedMode}, platformMode=${currentPlatformMode})`);

    // Mode mismatch: test Connect account cannot be used with live platform keys (and vice versa)
    if (storedMode && storedMode !== currentPlatformMode) {
      return NextResponse.json({
        connected: false,
        accountId,
        mode: storedMode,
        platformMode: currentPlatformMode,
        needsReconnect: true,
        error: `This tenant is linked in ${storedMode.toUpperCase()} mode, but the platform is running in ${currentPlatformMode.toUpperCase()} mode. Disconnect and reconnect in ${currentPlatformMode.toUpperCase()} mode to take real payments.`,
      });
    }

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
          mode: storedMode,
          platformMode: currentPlatformMode,
          error: 'Invalid Stripe API key. Please check your environment variables. If you want to use test mode, set STRIPE_MODE=test in your environment.' 
        }, { status: 500 });
      }
      
      // If account doesn't exist or key doesn't have access, clear it from database
      if (stripeError.code === 'account_invalid' || stripeError.statusCode === 403) {
        const supabase = await getServerSupabase();
        await supabase
          .from('tenant_stripe')
          .update({
            connected: false,
            stripe_account_id: null,
            mode: null,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId);
          
        return NextResponse.json({ 
          connected: false,
          mode: null,
          platformMode: currentPlatformMode,
          needsReconnect: true,
          error: 'Found Stripe account from a different mode (test vs live). Disconnect is complete — reconnect in Live mode to take real payments.' 
        });
      }
      
      throw stripeError;
    }

    // Persist a pragmatic "connected" flag when fully ready
    const isConnected = !!(acc.charges_enabled && acc.payouts_enabled && acc.details_submitted);
    if (isConnected) await setTenantStripeAccountId(tenantId, accountId, true, storedMode ?? currentPlatformMode);

    return NextResponse.json({
      connected: isConnected,
      id: acc.id,
      accountId: acc.id, // alias for UI compatibility
      mode: storedMode ?? currentPlatformMode,
      platformMode: currentPlatformMode,
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
