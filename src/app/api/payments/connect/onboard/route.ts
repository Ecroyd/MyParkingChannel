// app/api/payments/connect/onboard/route.ts
import { NextResponse } from 'next/server';
import { ROOT_URL, isStripeConfigured, stripe } from '@/lib/stripe';
import { getAuthedUserTenantId, getTenantStripeAccountId, setTenantStripeAccountId, getServerSupabase } from '@/lib/supabase-server';

export async function POST() {
  try {
    console.log('🔍 [PAYMENTS] Starting onboarding process...');
    console.log('🔍 [PAYMENTS] Stripe configured:', isStripeConfigured());
    
    if (!isStripeConfigured()) {
      console.error('❌ [PAYMENTS] Stripe is not properly configured');
      return NextResponse.json({ 
        error: 'Stripe is not properly configured. Please check environment variables.' 
      }, { status: 500 });
    }

    // Use the pre-configured Stripe instance from lib/stripe.ts
    
    const tenantId = await getAuthedUserTenantId();
    console.log('🔍 [PAYMENTS] Tenant ID:', tenantId);

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
    const clientId = process.env.STRIPE_CLIENT_ID;
    if (!clientId) {
      throw new Error('STRIPE_CLIENT_ID environment variable is required for Stripe Connect');
    }

    // Create OAuth URL with tenant_id in state parameter
    const state = `${tenantId}:${process.env.NODE_ENV === 'production' ? 'live' : 'test'}`;
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
