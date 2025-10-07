import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id');

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
    }

    // Verify user has access to this tenant
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has access to this tenant
    const { data: userTenant, error: accessError } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (accessError || !userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get Stripe connection details
    const adminClient = await createAdminClient();
    const { data: stripeConnection, error: stripeError } = await adminClient
      .from('tenant_stripe')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (stripeError || !stripeConnection?.connected) {
      return NextResponse.json({ error: 'No Stripe connection found' }, { status: 404 });
    }

    // Get secret key from tenant_stripe table
    const { data: stripeData, error: stripeDataError } = await adminClient
      .from('tenant_stripe')
      .select('stripe_secret_key')
      .eq('tenant_id', tenantId)
      .single();

    if (stripeDataError || !stripeData?.stripe_secret_key) {
      return NextResponse.json({ error: 'Stripe secret key not found' }, { status: 404 });
    }

    // Initialize Stripe with tenant's secret key
    const stripe = new Stripe(stripeData.stripe_secret_key, {
      apiVersion: '2023-10-16',
    });

    // Get account information
    const account = await stripe.accounts.retrieve(stripeConnection.stripe_account_id);

    return NextResponse.json(account);
  } catch (error: any) {
    console.error('Stripe Account Info Error:', error);
    return NextResponse.json({ error: 'Failed to fetch account information' }, { status: 500 });
  }
}
