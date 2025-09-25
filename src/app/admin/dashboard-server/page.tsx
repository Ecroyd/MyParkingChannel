// src/app/admin/dashboard-server/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
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
  const adminClient = createAdminClient();

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

  const [bookingsResult, recentBookingsResult, totalBookingsResult, chartBookingsResult] = await Promise.all([
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
      .select('start_at, end_at, source')
      .eq('tenant_id', tenant.id)
      .gte('start_at', `${chartStartStr}T00:00:00.000Z`)
      .order('start_at', { ascending: true })
  ]);

  const bookings = bookingsResult.data || [];
  const recentBookings = recentBookingsResult.data || [];
  const totalBookingsCount = totalBookingsResult.count || 0;
  const chartBookings = chartBookingsResult.data || [];

  // Process chart data
  const chartData = processChartData(chartBookings, chartStartDate, today);

  // Calculate capacity data
  const capacityData = {
    totalCapacity: tenant.default_capacity || 100,
    capacityRemaining: (tenant.default_capacity || 100) - bookings.length
  };

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
    />
  );
}
