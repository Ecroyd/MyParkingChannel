// src/app/admin/tenant-sites-server/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import TenantSitesServerClient from './TenantSitesServerClient';

export default async function TenantSitesServerPage() {
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Please log in to continue</p>
        </div>
      </div>
    );
  }

  console.log('🔍 Tenant Sites: Checking user_tenants for user:', user.id)

  // Get user's tenants using admin client to bypass RLS
  const { data: userTenants, error: userTenantsError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (userTenantsError) {
    console.log('❌ Tenant Sites: Error fetching user tenants:', userTenantsError)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Error loading tenant data</p>
        </div>
      </div>
    );
  }

  console.log('📊 Tenant Sites: User tenants found:', userTenants?.length || 0, userTenants)

  if (!userTenants || userTenants.length === 0) {
    console.log('ℹ️ Tenant Sites: No tenants found for user')
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No tenant access found</p>
        </div>
      </div>
    );
  }

  // Get tenant details for all user tenants
  const tenantIds = userTenants.map(ut => ut.tenant_id);
  const { data: tenants, error: tenantsError } = await adminClient
    .from('tenants')
    .select('id, slug, name, timezone, default_capacity')
    .in('id', tenantIds);

  if (tenantsError) {
    console.log('❌ Tenant Sites: Error fetching tenant details:', tenantsError)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Error loading tenant details</p>
        </div>
      </div>
    );
  }

  console.log('📊 Tenant Sites: Tenant details found:', tenants?.length || 0, tenants)

  // Get site and branding data for each tenant
  const [sitesResult, brandingResult] = await Promise.all([
    adminClient
      .from('sites')
      .select('id, tenant_id, slug, status, template, primary_domain, booking_modal_style')
      .in('tenant_id', tenantIds),
    adminClient
      .from('tenant_branding')
      .select('tenant_id, app_name, theme_color')
      .in('tenant_id', tenantIds)
  ]);

  const sites = sitesResult.data || [];
  const branding = brandingResult.data || [];

  console.log('📊 Tenant Sites: Sites found:', sites?.length || 0, sites)
  console.log('📊 Tenant Sites: Branding found:', branding?.length || 0, branding)

  // Combine data
  const tenantsWithSites = userTenants.map(ut => {
    const tenant = tenants?.find(t => t.id === ut.tenant_id);
    if (!tenant) return null; // Skip if tenant not found
    
    const site = sites.find(s => s.tenant_id === tenant.id);
    const tenantBranding = branding.find(b => b.tenant_id === tenant.id);
    
    return {
      ...tenant,
      site,
      branding: tenantBranding,
      role: ut.role,
      is_default: ut.is_default
    };
  }).filter((tenant): tenant is NonNullable<typeof tenant> => tenant !== null);

  console.log('📊 Tenant Sites: Combined data:', tenantsWithSites?.length || 0, tenantsWithSites)

  return (
    <TenantSitesServerClient
      user={user}
      tenants={tenantsWithSites}
    />
  );
}
