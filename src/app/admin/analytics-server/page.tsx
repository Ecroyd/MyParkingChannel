// src/app/admin/analytics-server/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import AnalyticsServerClient from './AnalyticsServerClient';

export default async function AnalyticsServerPage() {
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

  // Get user's default tenant
  const { data: userTenant } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .single();

  if (!userTenant?.tenant_id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No tenant access found</p>
        </div>
      </div>
    );
  }

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

  // Get analytics data using admin client
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 14);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = today.toISOString().split('T')[0];

  const { data: bookings } = await adminClient
    .from('bookings')
    .select('start_at, end_at, source')
    .eq('tenant_id', tenant.id)
    .gte('start_at', `${startStr}T00:00:00.000Z`)
    .lte('start_at', `${endStr}T23:59:59.999Z`)
    .order('start_at', { ascending: true });

  // Process chart data
  const chartData = processAnalyticsData(bookings || [], startDate, today);

  return (
    <AnalyticsServerClient
      user={user}
      tenant={tenant}
      chartData={chartData}
    />
  );
}

// Process analytics data from bookings
function processAnalyticsData(bookings: any[], startDate: Date, endDate: Date) {
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
