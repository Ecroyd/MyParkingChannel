// src/app/admin/dashboard-server/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { getTenantDateRange } from '@/lib/timezone';
import { calculateCapacityByDate, calculateCapacityForDate } from '@/lib/capacity/rolling';
import DashboardClient from './DashboardClient';

// Process chart data from bookings
function processChartData(bookings: any[], startDate: Date, endDate: Date) {
  const data: Array<{ date: string; in: number; out: number; capacity: number }> = [];
  
  // Generate date range
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    data.push({
      date: dateStr,
      in: 0,
      out: 0,
      capacity: 100 // Default capacity
    });
    current.setDate(current.getDate() + 1);
  }
  
  // Process bookings
  bookings.forEach(booking => {
    const bookingDate = new Date(booking.start_at).toISOString().split('T')[0];
    const dayData = data.find(d => d.date === bookingDate);
    if (dayData) {
      dayData.in++;
    }
    
    if (booking.end_at) {
      const endDate = new Date(booking.end_at).toISOString().split('T')[0];
      const endDayData = data.find(d => d.date === endDate);
      if (endDayData) {
        endDayData.out++;
      }
    }
  });
  
  return data;
}

export default async function DashboardServerPage() {
  const supabase = await createServerClient();
  const adminClient = await createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Please log in to continue</p>
        </div>
      </div>
    );
  }

  // Get user's tenants
  console.log('🔍 Dashboard: Checking user_tenants for user:', user.id)
  const { data: userTenants, error: userTenantsError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (userTenantsError) {
    console.log('❌ Dashboard: Error fetching user tenants:', userTenantsError)
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Error loading tenant data</p>
        </div>
      </div>
    );
  }

  console.log('📊 Dashboard: User tenants found:', userTenants?.length || 0, userTenants)

  // Find the default tenant or use the first one
  const userTenant = userTenants?.find(ut => ut.is_default) || userTenants?.[0];

  if (!userTenant?.tenant_id) {
    console.log('ℹ️ Dashboard: No tenant found for user')
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No tenant access found</p>
        </div>
      </div>
    );
  }

  console.log('✅ Dashboard: Using tenant:', userTenant.tenant_id)

  // Get tenant details
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('id, name, slug, timezone, default_capacity')
    .eq('id', userTenant.tenant_id)
    .single();

  if (!tenant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Tenant not found</p>
        </div>
      </div>
    );
  }

  // Get today's date range in tenant timezone
  const tenantTimezone = tenant.timezone || 'Europe/London';
  const { startOfDayUTC, endOfDayUTC } = getTenantDateRange(tenantTimezone);

  // Get bookings data using admin client
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Get date range for chart (last 14 days)
  const chartStartDate = new Date(today);
  chartStartDate.setDate(chartStartDate.getDate() - 14);
  const chartStartStr = chartStartDate.toISOString().split('T')[0];

  const [bookingsResult, recentBookingsResult, totalBookingsResult, chartBookingsResult, arrivalsResult, departuresResult] = await Promise.all([
    adminClient
      .from('bookings')
      .select('money_received, status, start_at')
      .eq('tenant_id', tenant.id)
      .gte('start_at', `${todayStr}T00:00:00.000Z`)
      .lt('start_at', `${tomorrowStr}T00:00:00.000Z`),
    
    adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('start_at', { ascending: false })
      .limit(10),
    
    adminClient
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id),
    
    adminClient
      .from('bookings')
      .select('start_at, end_at, source, external_source')
      .eq('tenant_id', tenant.id)
      .gte('start_at', `${chartStartStr}T00:00:00.000Z`)
      .order('start_at', { ascending: true }),
    
    // Get today's arrivals (bookings starting today)
    adminClient
      .from('bookings')
      .select('id, reference, customer_name, plate, start_at, status, flight_number')
      .eq('tenant_id', tenant.id)
      .gte('start_at', startOfDayUTC.toISOString())
      .lt('start_at', endOfDayUTC.toISOString())
      .order('start_at', { ascending: true })
      .limit(10),
    
    // Get today's departures (bookings ending today)
    adminClient
      .from('bookings')
      .select('id, reference, customer_name, plate, end_at, status, flight_number')
      .eq('tenant_id', tenant.id)
      .gte('end_at', startOfDayUTC.toISOString())
      .lt('end_at', endOfDayUTC.toISOString())
      .order('end_at', { ascending: true })
      .limit(10)
  ]);

  const bookings = bookingsResult.data || [];
  const recentBookings = recentBookingsResult.data || [];
  const totalBookingsCount = totalBookingsResult.count || 0;
  const chartBookings = chartBookingsResult.data || [];
  const todayArrivals = arrivalsResult.data || [];
  const todayDepartures = departuresResult.data || [];

  // Process chart data
  const chartData = processChartData(chartBookings, chartStartDate, today);

  // Calculate capacity data using rolling capacity logic
  const todayCapacity = await calculateCapacityForDate(tenant.id, todayStr);
  const totalCapacity = todayCapacity ?? 0;
  
  // Get active bookings for today (bookings that overlap with today)
  const { data: activeBookings } = await adminClient
    .from('bookings')
    .select('id')
    .eq('tenant_id', tenant.id)
    .in('status', ['reserved', 'confirmed', 'checked_in'])
    .lte('start_at', `${tomorrowStr}T00:00:00.000Z`)
    .gte('end_at', `${todayStr}T00:00:00.000Z`);

  const activeBookingsCount = activeBookings?.length || 0;

  const capacityData = {
    totalCapacity,
    capacityRemaining: Math.max(0, totalCapacity - activeBookingsCount)
  };

  // Calculate capacity for demand curve date range (next 14 days by default)
  const demandCurveEndDate = new Date(today);
  demandCurveEndDate.setDate(demandCurveEndDate.getDate() + 14);
  const demandCurveDates: string[] = [];
  const currentDate = new Date(today);
  while (currentDate <= demandCurveEndDate) {
    demandCurveDates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  const demandCurveCapacityByDate = await calculateCapacityByDate(tenant.id, demandCurveDates);

  // Calculate revenue data
  const revenueData = {
    todayRevenue: bookings.reduce((sum, booking) => sum + (booking.money_received || 0), 0),
    totalBookings: bookings.length
  };

  return (
    <DashboardClient
      user={user}
      tenant={tenant}
      bookings={bookings}
      recentBookings={recentBookings}
      totalBookingsCount={totalBookingsCount}
      capacityData={capacityData}
      revenueData={revenueData}
      chartData={chartData}
      todayArrivals={todayArrivals}
      todayDepartures={todayDepartures}
      demandCurveCapacityByDate={demandCurveCapacityByDate}
    />
  );
}
