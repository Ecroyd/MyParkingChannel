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
      console.log('🔍 Site SEO Data: Regular client failed, trying admin client...');
        const adminClient8 = await createAdminClient();
      const { data: adminUserTenant, error: adminTenantError } = await adminClient8
        .from('user_tenants')
        .select(`
          tenant_id,
          role,
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

    const tenant = userTenant.tenants;
    const tenantId = (tenant as any).id;

    // Get profile data using admin client
        const adminClient8 = await createAdminClient();
    const { data: profile, error: profileError } = await adminClient8
      .from('tenant_public_profile')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ 
        error: 'Failed to fetch profile data' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      data: profile || { 
        tenant_id: tenantId, 
        features: ["CCTV", "24/7 Access", "Free Shuttle", "ANPR-protected"],
        faq: [],
        hours: []
      }
    });

  } catch (error: any) {
    console.error('Site SEO data error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await getServerSupabase();
    const data = await req.json();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ 
        error: 'Not authenticated' 
      }, { status: 401 });
    }

    // Get user's tenant using admin client to avoid RLS recursion
        const adminClient8 = await createAdminClient();
    const { data: userTenant, error: tenantError } = await adminClient8
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        tenants (
          id,
          name,
          slug,
          timezone
        )
      `)
      .eq('user_id', user.id)
      .single();

    if (tenantError || !userTenant?.tenants) {
      return NextResponse.json({ 
        error: 'No tenant found for user' 
      }, { status: 404 });
    }

    const tenant = userTenant.tenants;
    const tenantId = (tenant as any).id;

    // Update profile data using admin client
        const adminClient8 = await createAdminClient();
    const { data: result, error: updateError } = await adminClient8
      .from('tenant_public_profile')
      .upsert({ ...data, tenant_id: tenantId })
      .select();

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json({ 
        error: 'Failed to update profile data' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      data: result 
    });

  } catch (error: any) {
    console.error('Site SEO data update error:', error);
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
