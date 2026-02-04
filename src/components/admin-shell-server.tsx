import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import AdminShellClient from './admin-shell-client';

interface AdminShellServerProps {
  children: ReactNode;
}

export default async function AdminShellServer({ children }: AdminShellServerProps) {
  const headersList = await headers();
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    redirect('/login');
  }

  // Get current tenant context (includes role)
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    // No tenant context - check if user has any tenants
    const { data: userTenants } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .limit(1);
    
    if (!userTenants || userTenants.length === 0) {
      // User has no tenants - check if we're already on setup page
      // The setup page has its own layout that will handle rendering
      // We need to allow it to render here to avoid redirect loops
      const referer = headersList.get('referer') || '';
      const host = headersList.get('host') || '';
      const isSetupPage = referer.includes('/admin/setup') || host.includes('setup');
      
      // If not on setup page, redirect to it
      // If on setup page, let the setup layout handle it
      if (!isSetupPage) {
        redirect('/admin/setup');
      }
      // Allow setup page to render without tenant context
      return <>{children}</>;
    } else {
      // User has tenants but context couldn't be resolved - redirect to login
      redirect('/login');
    }
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

  // Load health from system_health_status (primary source); client only hits API if stale/missing
  let initialHealthData: { canary: unknown; emailParse: unknown; cavu: unknown; updatedAt: string } | null = null;
  try {
    const [canaryRes, tenantRes] = await Promise.all([
      adminClient.from('system_health_status').select('payload, updated_at').is('tenant_id', null).eq('key', 'canary').maybeSingle(),
      adminClient.from('system_health_status').select('key, payload, updated_at').eq('tenant_id', ctx.tenantId).in('key', ['cavu', 'email_parse']),
    ]);
    const canaryRow = canaryRes.data;
    const tenantRows = tenantRes.data ?? [];
    const cavuRow = tenantRows.find((r: { key: string }) => r.key === 'cavu');
    const emailParseRow = tenantRows.find((r: { key: string }) => r.key === 'email_parse');
    const dates: string[] = [canaryRow?.updated_at, cavuRow?.updated_at, emailParseRow?.updated_at].filter(Boolean) as string[];
    if (dates.length > 0 || canaryRow || cavuRow || emailParseRow) {
      const updatedAt = dates.length ? dates.sort().reverse()[0]! : new Date().toISOString();
      initialHealthData = {
        canary: canaryRow?.payload ?? null,
        emailParse: emailParseRow?.payload ?? null,
        cavu: cavuRow?.payload ?? null,
        updatedAt,
      };
    }
  } catch {
    // Table may not exist; client will use API
  }

  return (
    <AdminShellClient 
      user={user} 
      tenant={tenant} 
      isPlatformAdmin={isPlatformAdmin}
      userRole={ctx.role}
      initialHealthData={initialHealthData}
    >
      {children}
    </AdminShellClient>
  );
}
