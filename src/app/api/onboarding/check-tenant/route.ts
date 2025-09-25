// src/app/api/onboarding/check-tenant/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET() {
  try {
    console.log('🔍 Check-tenant API: Starting tenant check...')
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.log('❌ Check-tenant API: User not authenticated:', userError)
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('✅ Check-tenant API: User authenticated:', user.id, user.email)

    // Check if user has any tenant access
    console.log('🔍 Check-tenant API: Checking user_tenants for user:', user.id)
    const { data: userTenants, error: tenantError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (tenantError) {
      console.error('❌ Check-tenant API: Error fetching user tenants:', tenantError);
      return NextResponse.json({ error: 'Failed to check tenant access' }, { status: 500 });
    }

    console.log('📊 Check-tenant API: User tenants found:', userTenants?.length || 0, userTenants)

    if (!userTenants || userTenants.length === 0) {
      console.log('ℹ️ Check-tenant API: No tenant access found for user')
      return NextResponse.json({ 
        hasTenant: false, 
        message: 'No tenant access found' 
      }, { status: 200 });
    }

    // Get tenant details
    const tenantIds = userTenants.map(ut => ut.tenant_id);
    console.log('🔍 Check-tenant API: Fetching tenant details for IDs:', tenantIds)
    
    const { data: tenants, error: tenantsError } = await adminClient
      .from('tenants')
      .select('id, name, slug, timezone, default_capacity')
      .in('id', tenantIds);

    if (tenantsError) {
      console.error('❌ Check-tenant API: Error fetching tenants:', tenantsError);
      return NextResponse.json({ error: 'Failed to fetch tenant details' }, { status: 500 });
    }

    console.log('📊 Check-tenant API: Tenant details found:', tenants?.length || 0, tenants)

    // Find default tenant
    const defaultTenant = userTenants.find(ut => ut.is_default);
    const defaultTenantData = defaultTenant ? 
      tenants?.find(t => t.id === defaultTenant.tenant_id) : 
      tenants?.[0];

    console.log('✅ Check-tenant API: Default tenant found:', defaultTenantData)

    const response = {
      hasTenant: true,
      tenant: defaultTenantData, // For backward compatibility
      tenants: tenants || [],
      defaultTenant: defaultTenantData,
      userTenants: userTenants
    }

    console.log('📤 Check-tenant API: Returning response:', response)
    return NextResponse.json(response, { status: 200 });

  } catch (err: any) {
    console.error('Check tenant error:', err);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}