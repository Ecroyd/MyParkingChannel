import { redirect } from 'next/navigation';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canManageSettings } from '@/lib/auth/permissions';
import { createAdminClient } from '@/lib/supabase/server-admin';
import TenantEmailSettingsClient from './TenantEmailSettingsClient';

export default async function TenantEmailSettingsPage() {
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    redirect('/login');
  }

  if (!canManageSettings(ctx.role)) {
    redirect('/admin');
  }

  const adminClient = await createAdminClient();

  // Fetch current tenant email settings
  const { data: settings } = await adminClient
    .from('tenant_email_settings')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  // Fetch tenant name for display
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('name')
    .eq('id', ctx.tenantId)
    .single();

  return (
    <TenantEmailSettingsClient
      initialSettings={settings || null}
      tenantName={tenant?.name || ''}
      tenantId={ctx.tenantId}
    />
  );
}
