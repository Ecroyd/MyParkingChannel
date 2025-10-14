// app/api/payments/connect/onboard/route.ts
import { NextResponse } from 'next/server';
import { ROOT_URL, isStripeConfigured, stripe } from '@/lib/stripe';
import { getAuthedUserTenantId, getTenantStripeAccountId, setTenantStripeAccountId, getServerSupabase } from '@/lib/supabase-server';

export async function POST(req: Request) {
  try {
    console.log('🔍 [PAYMENTS] Starting onboarding process...');
    console.log('🔍 [PAYMENTS] Stripe configured:', isStripeConfigured());
    
    if (!isStripeConfigured()) {
      console.error('❌ [PAYMENTS] Stripe is not properly configured');
      return NextResponse.json({ 
        error: 'Stripe is not properly configured. Please check environment variables.' 
      }, { status: 500 });
    }

    // Parse request body to get mode
    const body = await req.json().catch(() => ({}));
    const requestedMode = body.mode || 'test';
    
    const tenantId = await getAuthedUserTenantId();
    console.log('🔍 [PAYMENTS] Tenant ID:', tenantId);
    console.log('🔍 [PAYMENTS] Requested mode:', requestedMode);

    // Check if tenant already has a connected account
    const { accountId, connected } = await getTenantStripeAccountId(tenantId);
    
    // ✅ if already connected → generate login link
    if (connected && accountId) {
      console.log('🔍 [PAYMENTS] Tenant already has connected account:', accountId);
      const link = await stripe.accounts.createLoginLink(accountId);
      return NextResponse.json({ 
        url: link.url,
        accountId, 
        connected: true,
        message: 'Account already connected - redirecting to Stripe dashboard' 
      });
    }

    // 🚀 if not connected → generate onboarding link
    // Use the requested mode from the frontend
    const isTest = requestedMode === 'test';
    const isLive = requestedMode === 'live';
    
    // Select the correct client ID based on requested mode
    const clientId = isTest 
      ? process.env.STRIPE_CLIENT_ID_TEST 
      : process.env.STRIPE_CLIENT_ID_LIVE;
      
    if (!clientId) {
      const mode = isTest ? 'test' : 'live';
      throw new Error(`STRIPE_CLIENT_ID_${mode.toUpperCase()} environment variable is required for Stripe Connect`);
    }

    console.log('🔍 [PAYMENTS] Using Stripe Connect in', isTest ? 'TEST' : 'LIVE', 'mode with client ID:', clientId.substring(0, 12) + '...');

    // Create OAuth URL with tenant_id in state parameter
    const state = `${tenantId}:${requestedMode}`;
    const oauthUrl = new URL('https://connect.stripe.com/oauth/authorize');
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('client_id', clientId);
    oauthUrl.searchParams.set('scope', 'read_write');
    oauthUrl.searchParams.set('state', state);
    oauthUrl.searchParams.set('redirect_uri', `${ROOT_URL}/api/payments/connect/status`);

    console.log('🔍 [PAYMENTS] Created OAuth URL for tenant:', tenantId);
    return NextResponse.json({ 
      url: oauthUrl.toString(),
      tenantId 
    });
  } catch (error: any) {
    console.error('Onboard error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to create Stripe Connect URL' 
    }, { status: 500 });
  }
}
