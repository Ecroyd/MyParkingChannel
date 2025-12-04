import { createAdminClient } from '@/lib/supabase/server-admin';
import { createServerClient } from '@/lib/supabase/server';
import TodayServerClient from './TodayServerClient';
import { getTenantDateRange } from '@/lib/timezone';
import { calculateCapacityForDate } from '@/lib/capacity/rolling';

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
      .select('id, tenant_id, reference, customer_name, customer_email, customer_phone, plate, car_make, car_model, car_color, start_at, end_at, status, money_received, money_charged, source, flight_number, notes, stripe_payment_intent_id, payment_status, checked_in_at, checked_out_at, gate_status, highlight_code')
      .eq('tenant_id', tenantId)
      .gte('start_at', startOfDayUTC.toISOString())
      .lt('start_at', endOfDayUTC.toISOString())
      .order('start_at', { ascending: false });

    // Get today's departures (bookings ending today)
    const { data: departures, error: departuresError } = await adminClient
      .from('bookings')
      .select('id, tenant_id, reference, customer_name, customer_email, customer_phone, plate, car_make, car_model, car_color, start_at, end_at, status, money_received, money_charged, source, flight_number, notes, stripe_payment_intent_id, payment_status, checked_in_at, checked_out_at, gate_status, highlight_code')
      .eq('tenant_id', tenantId)
      .gte('end_at', startOfDayUTC.toISOString())
      .lt('end_at', endOfDayUTC.toISOString())
      .order('end_at', { ascending: false });

    // Get bookings that overlap with today's date range (for "currently parked" - shows who is/will be parked today)
    // A booking overlaps if: start_at < endOfDay AND end_at > startOfDay
    // Include all bookings that are meant to be in the car park (not cancelled)
    const { data: currentlyParked, error: currentlyParkedError } = await adminClient
      .from('bookings')
      .select('id, tenant_id, reference, customer_name, customer_email, customer_phone, plate, car_make, car_model, car_color, start_at, end_at, status, money_received, money_charged, source, flight_number, notes, stripe_payment_intent_id, payment_status, checked_in_at, checked_out_at, gate_status, highlight_code')
      .eq('tenant_id', tenantId)
      .lt('start_at', endOfDayUTC.toISOString())
      .gt('end_at', startOfDayUTC.toISOString())
      .neq('status', 'cancelled');

    // Calculate today's revenue
    const { data: todayBookings, error: revenueError } = await adminClient
      .from('bookings')
      .select('money_received')
      .eq('tenant_id', tenantId)
      .gte('start_at', startOfDayUTC.toISOString())
      .lt('start_at', endOfDayUTC.toISOString())
      .not('money_received', 'is', null);

    const totalRevenue = todayBookings?.reduce((sum, booking) => sum + (booking.money_received || 0), 0) || 0;

    // Calculate today's capacity using rolling capacity logic
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCapacity = await calculateCapacityForDate(tenant.id, todayStr);
    const totalCapacity = todayCapacity ?? 0;

    // Calculate KPIs
    const kpis = {
      arrivals: arrivals?.length || 0,
      departures: departures?.length || 0,
      checkedIn: currentlyParked?.length || 0,
      capacityLeft: Math.max(0, totalCapacity - (currentlyParked?.length || 0)),
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
