import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canViewAnalytics } from '@/lib/auth/permissions';
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';

export default async function AnalyticsPage() {
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    redirect('/login');
  }

  if (!canViewAnalytics(ctx.role)) {
    redirect('/admin');
  }

  const adminClient = await createAdminClient();

  // Get tenant details
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('id, name, slug, timezone, default_capacity')
    .eq('id', ctx.tenantId)
    .single();

  if (!tenant) {
    redirect('/admin');
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Comprehensive revenue and occupancy analytics with export capabilities
        </p>
        <p className="text-xs text-muted-foreground">Tenant: {tenant.name} ({tenant.slug})</p>
      </div>
      <AnalyticsDashboard tenantId={tenant.id} />
    </section>
  );
}

