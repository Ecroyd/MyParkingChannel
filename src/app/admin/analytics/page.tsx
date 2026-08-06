import { Suspense } from 'react';
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

  const adminClient = createAdminClient();

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
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Tenant reporting centre — KPIs, channels, stay/lead, occupancy, exports
        </p>
        <p className="text-xs text-muted-foreground">
          Tenant: {tenant.name} ({tenant.slug}) · {tenant.timezone || 'Europe/London'}
        </p>
      </div>
      <Suspense
        fallback={<div className="text-sm text-slate-500">Loading analytics…</div>}
      >
        <AnalyticsDashboard
          tenantId={tenant.id}
          timezone={tenant.timezone || 'Europe/London'}
        />
      </Suspense>
    </section>
  );
}
