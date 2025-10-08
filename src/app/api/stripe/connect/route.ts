import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenant_id');
    const mode = searchParams.get('mode') || 'test'; // Default to test mode

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID is required' }, { status: 400 });
    }

    // Check environment variables
    if (process.env.NODE_ENV !== 'production' && !process.env.STRIPE_CLIENT_ID) {
      console.error('STRIPE_CLIENT_ID is not set for development');
      return NextResponse.json({ error: 'Stripe Client ID missing for development. Please set STRIPE_CLIENT_ID in your environment variables.' }, { status: 500 });
    }

    if (!process.env.NEXT_PUBLIC_SITE_URL) {
      console.error('NEXT_PUBLIC_SITE_URL is not set');
      return NextResponse.json({ error: 'Site URL configuration missing. Please set NEXT_PUBLIC_SITE_URL in your environment variables.' }, { status: 500 });
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

    // Build Stripe OAuth URL directly
    const stripeOAuthUrl = new URL('https://connect.stripe.com/oauth/v2/authorize');
    
    // Use different client IDs based on mode and environment
    let clientId: string;
    
    if (mode === 'test') {
      // Test mode - use test client ID
      clientId = process.env.NODE_ENV === 'production' 
        ? 'ca_TBxx6uZatvGwdVLNpsVQaXlY39p3gXTv'  // Production test client ID
        : process.env.STRIPE_CLIENT_ID!;          // Development test client ID
    } else {
      // Live mode - use live client ID
      clientId = process.env.NODE_ENV === 'production' 
        ? 'ca_TBxxxSmeoiiU1clxQQUO0SzIXuYw335v'  // Production live client ID
        : process.env.STRIPE_CLIENT_ID!;          // Development (fallback to test)
    }
    
    stripeOAuthUrl.searchParams.set('client_id', clientId!);
    stripeOAuthUrl.searchParams.set('response_type', 'code');
    stripeOAuthUrl.searchParams.set('scope', 'read_write');
    stripeOAuthUrl.searchParams.set('redirect_uri', `${process.env.NEXT_PUBLIC_SITE_URL}/api/stripe/callback`);
    stripeOAuthUrl.searchParams.set('state', `${tenantId}:${mode}`); // Include mode in state

    return NextResponse.redirect(stripeOAuthUrl.toString());
  } catch (error: any) {
    console.error('Stripe Connect Error:', error);
    return NextResponse.json({ 
      error: 'Failed to initiate Stripe connection',
      details: error.message 
    }, { status: 500 });
  }
}