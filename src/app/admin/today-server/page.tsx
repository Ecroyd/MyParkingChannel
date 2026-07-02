import { createAdminClient } from '@/lib/supabase/server-admin';
import { createServerClient } from '@/lib/supabase/server';
import TodayServerClient from './TodayServerClient';
import { loadTodayPageDataForTenantToday } from '@/lib/today/loadTodayData';

export default async function TodayServerPage() {
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return <div>Error: Not authenticated</div>;
    }

    const { data: userTenants, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (userTenantsError || !userTenants?.length) {
      return <div>Error: No tenant access found</div>;
    }

    const defaultTenant = userTenants.find((ut) => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;

    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('id, name, slug, timezone, default_capacity')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return <div>Error: Tenant not found</div>;
    }

    const tenantTimezone = tenant.timezone || 'Europe/London';
    const data = await loadTodayPageDataForTenantToday(adminClient, tenantId, tenantTimezone, tenant);

    if (data.queryError) {
      console.error('Today page query errors:', data.queryError);
    }

    return (
      <TodayServerClient
        tenant={tenant}
        kpis={data.kpis}
        arrivals={data.arrivals}
        departures={data.departures}
        currentlyParked={data.currentlyParked}
        initialDateRange={{ from: data.rangeFrom, to: data.rangeTo }}
        queryError={data.queryError}
      />
    );
  } catch (error) {
    console.error('Today page error:', error);
    return <div>Error loading today&apos;s data</div>;
  }
}
