import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerClient();
    const adminClient = await createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user's default tenant
    const { data: userTenant, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();

    if (userTenantsError || !userTenant) {
      return NextResponse.json({ error: 'No default tenant found' }, { status: 404 });
    }

    return NextResponse.json({ 
      tenant_id: userTenant.tenant_id,
      role: userTenant.role 
    });
  } catch (error) {
    console.error('Error getting current tenant:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

