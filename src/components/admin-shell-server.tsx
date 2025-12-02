import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import AdminShellClient from './admin-shell-client';

interface AdminShellServerProps {
  children: ReactNode;
}

export default async function AdminShellServer({ children }: AdminShellServerProps) {
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

  // Get current tenant context (includes role)
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    // No tenant context - redirect to login or tenant selection
    redirect('/login');
  }

  // Get tenant details
  const { data: tenantData, error: tenantDataError } = await adminClient
    .from('tenants')
    .select('id, name, slug, timezone, brand_logo_url')
    .eq('id', ctx.tenantId)
    .single();
  
  if (tenantDataError || !tenantData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Tenant not found</p>
        </div>
      </div>
    );
  }

  // Get logo from tenant_public_profile
  const { data: profile } = await adminClient
    .from('tenant_public_profile')
    .select('logo_url')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  
  const tenant = {
    ...tenantData,
    logo_url: profile?.logo_url || tenantData.brand_logo_url
  };

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
      userRole={ctx.role}
    >
      {children}
    </AdminShellClient>
  );
}
