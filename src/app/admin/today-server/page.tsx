import { createAdminClient } from '@/lib/supabase/server-admin';
import { createServerClient } from '@/lib/supabase/server';
import {
  computeOperationalKpis,
  getTodayBoundsUtc,
} from '@/lib/bookings/operational-state';
import TodayServerClient from './TodayServerClient';

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

    const defaultTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;

    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('id, name, slug, timezone, default_capacity')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return <div>Error: Tenant not found</div>;
    }

    const timezone = tenant.timezone || 'Europe/London';
    const { dayStartUtc, dayEndUtc } = getTodayBoundsUtc(timezone);

    const { data: allBookings, error: bookingsError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId);

    if (bookingsError) {
      return <div>Error loading bookings</div>;
    }

    const ops = computeOperationalKpis(
      allBookings || [],
      timezone,
      tenant.default_capacity || 0
    );

    const arrivals = ops.arrivalsToday.sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );

    const departures = ops.departuresToday.sort(
      (a, b) => new Date(a.end_at).getTime() - new Date(b.end_at).getTime()
    );

    const { data: todayRevenueRows } = await adminClient
      .from('bookings')
      .select('money_received')
      .eq('tenant_id', tenantId)
      .gte('start_at', dayStartUtc.toISOString())
      .lt('start_at', dayEndUtc.toISOString())
      .not('money_received', 'is', null);

    const totalRevenue =
      todayRevenueRows?.reduce((sum, booking) => sum + (booking.money_received || 0), 0) || 0;

    const kpis = {
      arrivalsRemaining: ops.arrivalsRemaining,
      departuresRemaining: ops.departuresRemaining,
      currentlyParked: ops.currentlyParked,
      capacityLeft: ops.capacityLeft,
      totalRevenue,
    };

    return (
      <TodayServerClient
        tenant={tenant}
        kpis={kpis}
        arrivals={arrivals}
        departures={departures}
        currentlyParked={ops.parkedList}
      />
    );
  } catch (error) {
    console.error('Today page error:', error);
    return <div>Error loading today&apos;s data</div>;
  }
}
