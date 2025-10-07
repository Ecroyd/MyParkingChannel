import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function POST(req: Request) {
  try {
    const { tenant_id } = await req.json();

    if (!tenant_id) {
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
      .eq('tenant_id', tenant_id)
      .single();

    if (accessError || !userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Disconnect Stripe account
    const adminClient = await createAdminClient();
    
    // Update tenant_stripe to disconnected
    const { error: stripeError } = await adminClient
      .from('tenant_stripe')
      .update({
        connected: false,
        stripe_account_id: null,
        stripe_publishable_key: null,
        stripe_secret_key: null,
        stripe_webhook_secret: null,
      })
      .eq('tenant_id', tenant_id);

    if (stripeError) {
      console.error('Database Error:', stripeError);
      return NextResponse.json({ error: 'Failed to disconnect Stripe account' }, { status: 500 });
    }

    // Remove webhook secret from tenant_secrets
    const { error: secretError } = await adminClient
      .from('tenant_secrets')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('scope', 'stripe')
      .eq('key', 'webhook_secret');

    if (secretError) {
      console.error('Secrets Error:', secretError);
      // Don't fail the disconnect for this, just log it
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Stripe Disconnect Error:', error);
    return NextResponse.json({ error: 'Failed to disconnect Stripe account' }, { status: 500 });
  }
}
