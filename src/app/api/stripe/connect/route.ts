import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id');

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
    }

    // Check environment variables
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('STRIPE_SECRET_KEY is not set');
      return NextResponse.json({ error: 'Stripe configuration missing' }, { status: 500 });
    }

    if (!process.env.NEXT_PUBLIC_SITE_URL) {
      console.error('NEXT_PUBLIC_SITE_URL is not set');
      return NextResponse.json({ error: 'Site URL configuration missing' }, { status: 500 });
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

    // Initialize Stripe with platform secret key
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });

    // Create Stripe Connect OAuth URL
    const url = stripe.oauth.authorizeUrl({
      response_type: 'code',
      scope: 'read_write',
      redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/stripe/callback`,
      state: tenantId,
    });

    return NextResponse.redirect(url);
  } catch (error: any) {
    console.error('Stripe Connect Error:', error);
    return NextResponse.json({ 
      error: 'Failed to initiate Stripe connection',
      details: error.message 
    }, { status: 500 });
  }
}
