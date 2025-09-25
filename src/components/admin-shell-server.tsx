import { ReactNode } from 'react';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import AdminShellClient from './admin-shell-client';

interface AdminShellServerProps {
  children: ReactNode;
}

export default async function AdminShellServer({ children }: AdminShellServerProps) {
  const supabase = await createServerClient();
  const adminClient = createAdminClient();

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

  // Get user's tenant using admin client to bypass RLS
  console.log('🔍 AdminShell: Checking user_tenants for user:', user.id)
  const { data: userTenants, error: tenantError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (tenantError) {
    console.log('❌ AdminShell: Error fetching user tenants:', tenantError)
  } else {
    console.log('📊 AdminShell: User tenants found:', userTenants?.length || 0, userTenants)
  }

  // Find the default tenant or use the first one
  const userTenant = userTenants?.find(ut => ut.is_default) || userTenants?.[0];

  let tenant = null;
  if (!tenantError && userTenant?.tenant_id) {
    console.log('🔍 AdminShell: Fetching tenant details for ID:', userTenant.tenant_id)
    // Get tenant details separately
    const { data: tenantData, error: tenantDataError } = await adminClient
      .from('tenants')
      .select('id, name, slug, timezone, brand_logo_url')
      .eq('id', userTenant.tenant_id)
      .single();
    
    if (tenantDataError) {
      console.log('❌ AdminShell: Error fetching tenant details:', tenantDataError)
    } else {
      console.log('📊 AdminShell: Tenant details found:', tenantData)
    }
    
    if (!tenantDataError && tenantData) {
      // Get logo from tenant_public_profile
      console.log('🔍 AdminShell: Fetching tenant profile...')
      const { data: profile } = await adminClient
        .from('tenant_public_profile')
        .select('logo_url')
        .eq('tenant_id', tenantData.id)
        .maybeSingle();
      
      // Add logo_url to tenant object
      tenant = {
        ...tenantData,
        logo_url: profile?.logo_url || tenantData.brand_logo_url
      };
      console.log('✅ AdminShell: Tenant object created:', tenant)
    }
  } else {
    console.log('ℹ️ AdminShell: No tenant found for user')
  }

  // Check if user is platform admin
  const { data: platformAdmin } = await adminClient
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  
  const isPlatformAdmin = !!platformAdmin;

  return (
    <AdminShellClient 
      user={user} 
      tenant={tenant} 
      isPlatformAdmin={isPlatformAdmin}
    >
      {children}
    </AdminShellClient>
  );
}
