import { redirect } from 'next/navigation';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';
import AlertRoutesClient from './AlertRoutesClient';

export const dynamic = 'force-dynamic';

export default async function AlertRoutesPage() {
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    redirect('/login');
  }

  if (ctx.role !== 'admin' && ctx.role !== 'owner') {
    redirect('/admin');
  }

  const supabase = createAdminClient();

  // Get alert routes for this tenant
  const { data: routes, error } = await supabase
    .from('tenant_alert_routes')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ALERT ROUTES] Error fetching routes', error);
  }

  // Get recent alerts
  const { data: recentAlerts } = await supabase
    .from('supplier_sync_alerts')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(20);

  // Transform alerts to extract errors from meta
  const transformedAlerts = (recentAlerts || []).map((alert: any) => ({
    ...alert,
    errors: alert.meta?.errors || null,
  }));

  return (
    <AlertRoutesClient 
      initialRoutes={routes || []} 
      recentAlerts={transformedAlerts}
      tenantId={ctx.tenantId}
    />
  );
}
