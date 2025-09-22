'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import DailyOccupancyStacked from '@/components/charts/DailyOccupancyStacked';
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TodayPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [capacityData, setCapacityData] = useState<any>(null);
  const [revenueData, setRevenueData] = useState<any>(null);
  const [dateRange, setDateRange] = useState('next14days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const getDateRange = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let result;
    switch (dateRange) {
      case 'next7days':
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextWeek.toISOString().split('T')[0] };
        break;
      case 'next14days':
        const nextTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextTwoWeeks.toISOString().split('T')[0] };
        break;
      case 'next30days':
        const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextMonth.toISOString().split('T')[0] };
        break;
      case 'next90days':
        const nextQuarter = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextQuarter.toISOString().split('T')[0] };
        break;
      case 'custom':
        result = { from: customStartDate, to: customEndDate };
        break;
      default:
        const defaultEnd = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: defaultEnd.toISOString().split('T')[0] };
    }
    
    console.log(`Date range for ${dateRange}:`, result);
    return result;
  };

  const handleBookingClick = (booking: any) => {
    setSelectedBooking(booking);
    setModalOpen(true);
  };

  const handleBookingUpdated = (updatedBooking: any) => {
    setSelectedBooking(updatedBooking);
    // Refresh the data
    window.location.reload();
  };

  useEffect(() => {
    (async () => {
      console.log('Dashboard: Starting data fetch...');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Dashboard: User authenticated:', !!user, user?.id);
      setUser(user);

      if (user) {
        // Get user's tenant
        const { data: userTenant, error: tenantError } = await supabase
          .from('user_tenants')
          .select(`
            tenant_id,
            role,
            tenants (
              id,
              name,
              slug,
              timezone,
              default_capacity
            )
          `)
          .eq('user_id', user.id)
          .single();

        if (userTenant?.tenants) {
          setTenant(userTenant.tenants);
          console.log('Dashboard: Using tenant:', userTenant.tenants.slug, 'ID:', userTenant.tenant_id);
          console.log('Dashboard: Tenant details:', userTenant.tenants);
          
          // Fetch capacity data for today
          try {
            const response = await fetch('/api/admin/today/summary', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ tenant: userTenant.tenants.slug })
            });

            if (response.ok) {
              const responseData = await response.json();
              console.log('Dashboard: Capacity data received:', responseData.data);
              setCapacityData(responseData.data);
            } else {
              console.error('Dashboard: Capacity API error:', response.status, response.statusText);
            }
          } catch (error) {
            console.error('Failed to fetch capacity data:', error);
          }

          // Fetch revenue data for today
          try {
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
            
            const { data: todayBookings, error: revenueError } = await supabase
              .from('bookings')
              .select('money_received, total_amount, status')
              .eq('tenant_id', userTenant.tenant_id)
              .gte('start_at', startOfDay.toISOString())
              .lt('start_at', endOfDay.toISOString());

            if (!revenueError && todayBookings) {
              console.log('Dashboard: Today bookings for revenue:', todayBookings.length);
              const totalRevenue = todayBookings
                .filter(b => b.status === 'checked_in' || b.status === 'reserved')
                .reduce((sum, b) => sum + (parseFloat(b.money_received) || parseFloat(b.total_amount) || 0), 0);
              
              console.log('Dashboard: Calculated revenue:', totalRevenue);
              setRevenueData({ totalRevenue });
            } else {
              console.log('Dashboard: No revenue data:', { revenueError, todayBookings: todayBookings?.length });
            }
          } catch (error) {
            console.error('Failed to fetch revenue data:', error);
          }

          // Get recent bookings for the current tenant (moved inside the tenant scope)
          try {
            const { data, error } = await supabase
              .from('bookings')
              .select('*')
              .eq('tenant_id', userTenant.tenant_id)
              .order('start_at', { ascending: false })
              .limit(10);

            console.log('Dashboard: Fetching bookings for tenant:', userTenant.tenant_id);
            console.log('Dashboard: Found bookings:', data?.length || 0);
            if (error) console.error('Dashboard: Bookings error:', error);
            
            if (data) setBookings(data);
          } catch (error) {
            console.error('Failed to fetch bookings:', error);
          }
        }
      }

      setLoading(false);
      
      // Final state logging
      console.log('Dashboard: Data fetch complete');
      console.log('Dashboard: Final state -', {
        user: !!user,
        tenant: !!tenant,
        bookings: bookings.length,
        capacityData: !!capacityData,
        revenueData: !!revenueData
      });
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">Welcome back, {user?.email}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900">Total Bookings</h3>
          <p className="text-3xl font-bold text-blue-600">{bookings.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900">Today's Revenue</h3>
          <p className="text-3xl font-bold text-green-600">
            £{revenueData?.totalRevenue?.toFixed(2) || '0.00'}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900">Active Spaces</h3>
          <p className="text-3xl font-bold text-orange-600">
            {capacityData ? `${capacityData.checkedIn}/${capacityData.totalCapacity}` : '0/0'}
          </p>
          {capacityData && (
            <p className="text-sm text-gray-600 mt-1">
              {capacityData.capacityRemaining} spaces remaining
            </p>
          )}
        </div>
      </div>

      {/* Demand Curve Chart */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="p-6 border-b">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Future Occupancy Forecast</h2>
              <p className="text-sm text-gray-500">Demand curve showing expected occupancy based on existing bookings</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <select 
                value={dateRange} 
                onChange={(e) => setDateRange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="next7days">Next 7 Days</option>
                <option value="next14days">Next 14 Days</option>
                <option value="next30days">Next 30 Days</option>
                <option value="next90days">Next 90 Days</option>
                <option value="custom">Custom Range</option>
              </select>
              {dateRange === 'custom' && (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-6">
          <DailyOccupancyStacked 
            tenantId={tenant?.id || user?.tenant_id || "default"} 
            start={getDateRange().from} 
            end={getDateRange().to} 
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Recent Bookings</h2>
        </div>
        <div className="p-6">
          {bookings.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No bookings found</p>
              <p className="text-sm text-gray-400 mt-2">Bookings will appear here once they're created</p>
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((booking) => (
                <div 
                  key={booking.id} 
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleBookingClick(booking)}
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {booking.customer_name || 'Unknown Customer'}
                    </p>
                    <p className="text-sm text-gray-600">
                      License: {booking.plate || 'N/A'} • 
                      Start: {new Date(booking.start_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">
                      £{booking.money_received || booking.total_amount || '0.00'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {booking.status || 'pending'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BookingDetailsModal
        open={modalOpen}
        booking={selectedBooking}
        onClose={() => setModalOpen(false)}
        onUpdated={handleBookingUpdated}
      />
    </main>
  );
}
