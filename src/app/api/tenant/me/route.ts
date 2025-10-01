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

    // Get user's tenant with fallback to admin client
    let userTenant;
    let tenantError;
    
    const { data: userTenantData, error: userTenantError } = await supabase
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

    userTenant = userTenantData;
    tenantError = userTenantError;

    // If regular client fails, try admin client
    if (tenantError || !userTenant?.tenants) {
      console.log('🔍 Tenant Me: Regular client failed, trying admin client...');
      const adminClient = await createAdminClient();
      const { data: adminUserTenant, error: adminTenantError } = await adminClient
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
      
      userTenant = adminUserTenant;
      tenantError = adminTenantError;
    }

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