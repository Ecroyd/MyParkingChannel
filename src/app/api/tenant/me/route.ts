import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ 
        tenant_id: null,
        slug: null,
        source: 'not_authenticated'
      });
    }

    // Get user's tenant using admin client to avoid RLS recursion
    const adminClient = await createAdminClient();
    const { data: userTenant, error: tenantError } = await adminClient
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        is_default,
        tenants (
          id,
          slug
        )
      `)
      .eq('user_id', user.id)
      .single();

    if (tenantError || !userTenant?.tenants) {
      return NextResponse.json({ 
        tenant_id: null,
        slug: null,
        source: 'no_tenant_found'
      });
    }

    const tenant = Array.isArray(userTenant.tenants) ? userTenant.tenants[0] : userTenant.tenants;

    return NextResponse.json({ 
      tenant_id: tenant.id,
      slug: tenant.slug,
      source: 'user_tenants'
    });

  } catch (error: any) {
    console.error('Tenant me error:', error);
    return NextResponse.json({ 
      tenant_id: null,
      slug: null,
      source: 'error'
    });
  }
}