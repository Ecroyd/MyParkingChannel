// src/app/admin/channels/cavu/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { getServerSupabase } from '@/lib/supabase/server';
import CavuSettingsClient from './CavuSettingsClient';

export const dynamic = 'force-dynamic';

export default async function CavuSettingsPage() {
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    redirect('/login');
  }

  // Only admins and owners can configure suppliers
  if (ctx.role !== 'admin' && ctx.role !== 'owner') {
    redirect('/admin');
  }

  const supabase = await getServerSupabase();

  const { data } = await supabase
    .from('tenant_supplier_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('supplier_code', 'cavu')
    .maybeSingle();

  const existingConfig = (data?.config as any) ?? {};

  return <CavuSettingsClient tenantId={ctx.tenantId} existingConfig={existingConfig} />;
}
