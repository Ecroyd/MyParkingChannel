import { createAdminClient } from '@/lib/supabase/server-admin';
import { createServerClient } from '@/lib/supabase/server';
import TodayServerClient from './TodayServerClient';
import { getTenantDateRange } from '@/lib/timezone';

export default async function TodayServerPage() {
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  try {
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return <div>Error: Not authenticated</div>;
    }

    // Get user's tenant
    const { data: userTenants, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (userTenantsError || !userTenants?.length) {
      return <div>Error: No tenant access found</div>;
    }

    // Get the default tenant or first tenant
    const defaultTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;

    // Get tenant details
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('id, name, slug, timezone, default_capacity')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return <div>Error: Tenant not found</div>;
    }

    // Get today's date range in tenant timezone
    const tenantTimezone = tenant.timezone || 'Europe/London';
    const { startOfDayUTC, endOfDayUTC } = getTenantDateRange(tenantTimezone);

    // Get today's arrivals (bookings starting today)
    const { data: arrivals, error: arrivalsError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('start_at', startOfDayUTC.toISOString())
      .lt('start_at', endOfDayUTC.toISOString())
      .order('start_at', { ascending: false });

    // Get today's departures (bookings ending today)
    const { data: departures, error: departuresError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('end_at', startOfDayUTC.toISOString())
      .lt('end_at', endOfDayUTC.toISOString())
      .order('end_at', { ascending: false });

    // Get currently parked cars (started before now, ending after now)
    const nowUTC = new Date();
    const { data: currentlyParked, error: currentlyParkedError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .lte('start_at', nowUTC.toISOString())
      .gte('end_at', nowUTC.toISOString())
      .in('status', ['reserved', 'checked_in']);

    // Calculate today's revenue
    const { data: todayBookings, error: revenueError } = await adminClient
      .from('bookings')
      .select('money_received')
      .eq('tenant_id', tenantId)
      .gte('start_at', startOfDayUTC.toISOString())
      .lt('start_at', endOfDayUTC.toISOString())
      .not('money_received', 'is', null);

    const totalRevenue = todayBookings?.reduce((sum, booking) => sum + (booking.money_received || 0), 0) || 0;

    // Calculate KPIs
    const kpis = {
      arrivals: arrivals?.length || 0,
      departures: departures?.length || 0,
      checkedIn: currentlyParked?.length || 0,
      capacityLeft: (tenant.default_capacity || 0) - (currentlyParked?.length || 0),
      totalRevenue
    };

    return (
      <TodayServerClient 
        tenant={tenant}
        kpis={kpis}
        arrivals={arrivals || []}
        departures={departures || []}
        currentlyParked={currentlyParked || []}
      />
    );

  } catch (error) {
    console.error('Today page error:', error);
    return <div>Error loading today's data</div>;
  }
}
