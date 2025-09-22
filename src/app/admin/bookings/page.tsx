'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import BookingsPageClient from '@/components/admin/BookingsPageClient';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function BookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [dateRange, setDateRange] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const getDateRange = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let result;
    switch (dateRange) {
      case 'today':
        result = { from: todayStr, to: todayStr };
        break;
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
      case 'custom':
        result = { from: customStartDate, to: customEndDate };
        break;
      default:
        result = null; // 'all' - no date filtering
    }
    
    console.log(`Date range for ${dateRange}:`, result);
    return result;
  };

  const filterBookingsByDate = (bookings: any[], dateRange: any) => {
    if (!dateRange) return bookings; // 'all' - return all bookings
    
    return bookings.filter(booking => {
      const startDate = new Date(booking.start_at).toISOString().split('T')[0];
      const endDate = new Date(booking.end_at).toISOString().split('T')[0];
      
      // Check if booking overlaps with the date range
      return startDate <= dateRange.to && endDate >= dateRange.from;
    });
  };

  useEffect(() => {
    (async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

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
            timezone
          )
        `)
        .eq('user_id', user.id)
        .single();

      if (userTenant?.tenants) {
        setTenant(userTenant.tenants);
      }

      // Get bookings for current tenant only (SECURITY: tenant isolation)
      if (userTenant?.tenants?.id) {
        const { data, error } = await supabase
          .from('bookings')
          .select('id, reference, customer_name, customer_email, plate, start_at, end_at, status, money_charged, money_received, flight_number, source, created_at')
          .eq('tenant_id', userTenant.tenants.id) // CRITICAL: Filter by tenant
          .order('start_at', { ascending: false })
          .limit(500);

        if (data) {
          setBookings(data);
          setFilteredBookings(data);
        }
      }
      setLoading(false);
    })();
  }, []);

  // Filter bookings when date range changes
  useEffect(() => {
    const dateRangeObj = getDateRange();
    const filtered = filterBookingsByDate(bookings, dateRangeObj);
    setFilteredBookings(filtered);
  }, [dateRange, customStartDate, customEndDate, bookings]);

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

  // Use real tenant or fallback
  const currentTenant = tenant || {
    id: 'default',
    name: 'Default Tenant',
    slug: 'default'
  };

  return (
    <BookingsPageClient
      tenant={currentTenant}
      bookings={filteredBookings}
      dateRange={dateRange}
      setDateRange={setDateRange}
      customStartDate={customStartDate}
      setCustomStartDate={setCustomStartDate}
      customEndDate={customEndDate}
      setCustomEndDate={setCustomEndDate}
    />
  );
}
