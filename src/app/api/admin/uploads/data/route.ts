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
        error: 'Not authenticated' 
      }, { status: 401 });
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
          name,
          slug,
          timezone
        )
      `)
      .eq('user_id', user.id)
      .single();

    userTenant = userTenantData;
    tenantError = userTenantError;

    // If regular client fails, try admin client
    if (tenantError || !userTenant?.tenants) {
      console.log('🔍 Uploads Data: Regular client failed, trying admin client...');
      const adminClient = await createAdminClient();
      const { data: adminUserTenant, error: adminTenantError } = await adminClient
        .from('user_tenants')
        .select(`
          tenant_id,
          role,
          is_default,
          tenants (
            id,
            name,
            slug,
            timezone
          )
        `)
        .eq('user_id', user.id)
        .single();
      
      userTenant = adminUserTenant;
      tenantError = adminTenantError;
    }

    if (tenantError || !userTenant?.tenants) {
      return NextResponse.json({ 
        error: 'No tenant found for user' 
      }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true,
      user: {
        id: user.id,
        email: user.email
      },
      tenant: userTenant.tenants
    });

  } catch (error: any) {
    console.error('Uploads data error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
