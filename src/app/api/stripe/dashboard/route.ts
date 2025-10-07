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
      .select('stripe_account_id')
      .eq('tenant_id', tenantId)
      .eq('connected', true)
      .single();

    if (stripeError || !stripeConnection?.stripe_account_id) {
      return NextResponse.json({ error: 'Tenant not connected to Stripe' }, { status: 404 });
    }

    // Initialize Stripe with platform secret key
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });

    // Create login link for tenant's Stripe dashboard
    const loginLink = await stripe.accounts.createLoginLink(stripeConnection.stripe_account_id);

    return NextResponse.redirect(loginLink.url);
  } catch (error: any) {
    console.error('Stripe Dashboard Error:', error);
    return NextResponse.json({ error: 'Failed to create dashboard link' }, { status: 500 });
  }
}

