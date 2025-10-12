// app/api/payments/connect/status/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getAuthedUserTenantId, getTenantStripeAccountId, setTenantStripeAccountId, getServerSupabase } from '@/lib/supabase-server';

export async function GET() {
  try {
    const tenantId = await getAuthedUserTenantId();
    const { accountId } = await getTenantStripeAccountId(tenantId);
    
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
