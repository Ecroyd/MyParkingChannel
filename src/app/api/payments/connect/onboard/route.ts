// app/api/payments/connect/onboard/route.ts
import { NextResponse } from 'next/server';
import { stripe, ROOT_URL, isStripeConfigured } from '@/lib/stripe';
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
    
    const tenantId = await getAuthedUserTenantId();
    console.log('🔍 [PAYMENTS] Tenant ID:', tenantId);

    let { accountId } = await getTenantStripeAccountId(tenantId);
    
    // Always create a new account to avoid issues with old accounts
    if (!accountId) {
      console.log('🔍 [PAYMENTS] Creating new Stripe account for tenant:', tenantId);
      console.log('🔍 [PAYMENTS] About to call stripe.accounts.create...');
      // Create controller-based connected account – per your spec
      const acct = await stripe.accounts.create({
        controller: {
          fees: { payer: 'account' },
          losses: { payments: 'stripe' },
          stripe_dashboard: { type: 'full' },
        },
      });
      console.log('🔍 [PAYMENTS] Stripe account created successfully:', acct.id);
      accountId = acct.id;
      await setTenantStripeAccountId(tenantId, accountId, false);
    } else {
      // If we have an account ID, verify it exists and is accessible
      try {
        await stripe.accounts.retrieve(accountId);
        console.log('Using existing account:', accountId);
      } catch (error: any) {
        console.log('Old account invalid, creating new one:', error.message);
        // Clear the old account and create a new one
        const supabase = await getServerSupabase();
        await supabase
          .from('tenant_stripe')
          .delete()
          .eq('tenant_id', tenantId);
        
        const acct = await stripe.accounts.create({
          controller: {
            fees: { payer: 'account' },
            losses: { payments: 'stripe' },
            stripe_dashboard: { type: 'full' },
          },
        });
        accountId = acct.id;
        await setTenantStripeAccountId(tenantId, accountId, false);
      }
    }

    console.log('Creating account link for account:', accountId);
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: `${ROOT_URL}/admin/payments?step=return`,
      refresh_url: `${ROOT_URL}/admin/payments?step=refresh`,
    });

    return NextResponse.json({ accountId, url: link.url });
  } catch (error: any) {
    console.error('Onboard error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to create Stripe account' 
    }, { status: 500 });
  }
}
