'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TodayPage() {
  const [todayData, setTodayData] = useState({
    arrivals: [] as any[],
    departures: [] as any[],
    currentlyParked: [] as any[],
    totalRevenue: 0,
    totalBookings: 0
  });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      // Get today's date range
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      // Get today's arrivals (bookings starting today)
      const { data: arrivals } = await supabase
        .from('bookings')
        .select('*')
        .gte('start_at', startOfDay.toISOString())
        .lt('start_at', endOfDay.toISOString())
        .order('start_at', { ascending: false });

      // Get today's departures (bookings ending today)
      const { data: departures } = await supabase
        .from('bookings')
        .select('*')
        .gte('end_at', startOfDay.toISOString())
        .lt('end_at', endOfDay.toISOString())
        .order('end_at', { ascending: false });

      // Get currently parked cars (started before now, ending after now)
      const now = new Date();
      const { data: currentlyParked } = await supabase
        .from('bookings')
        .select('*')
        .lte('start_at', now.toISOString())
        .gte('end_at', now.toISOString())
        .in('status', ['reserved', 'checked_in']);

      // Calculate today's revenue
      const { data: todayBookings } = await supabase
        .from('bookings')
        .select('money_received')
        .gte('start_at', startOfDay.toISOString())
        .lt('start_at', endOfDay.toISOString())
        .not('money_received', 'is', null);

      const totalRevenue = todayBookings?.reduce((sum, booking) => sum + (booking.money_received || 0), 0) || 0;

      setTodayData({
        arrivals: arrivals || [],
        departures: departures || [],
        currentlyParked: currentlyParked || [],
        totalRevenue,
        totalBookings: arrivals?.length || 0
      });
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
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

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Today's Overview</h1>
        <p className="text-gray-600">Welcome back, {user?.email} • {new Date().toLocaleDateString()}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900">Today's Arrivals</h3>
          <p className="text-3xl font-bold text-blue-600">{todayData.arrivals.length}</p>
          <p className="text-sm text-gray-500 mt-1">Cars arriving today</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900">Today's Departures</h3>
          <p className="text-3xl font-bold text-orange-600">{todayData.departures.length}</p>
          <p className="text-sm text-gray-500 mt-1">Cars leaving today</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900">Currently Parked</h3>
          <p className="text-3xl font-bold text-green-600">{todayData.currentlyParked.length}</p>
          <p className="text-sm text-gray-500 mt-1">Cars in car park now</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-900">Today's Revenue</h3>
          <p className="text-3xl font-bold text-green-600">£{todayData.totalRevenue.toFixed(2)}</p>
          <p className="text-sm text-gray-500 mt-1">From {todayData.totalBookings} bookings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Arrivals */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Today's Arrivals</h2>
            <p className="text-sm text-gray-500">Cars arriving today</p>
          </div>
          <div className="p-6">
            {todayData.arrivals.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No arrivals today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayData.arrivals.slice(0, 10).map((booking) => (
                  <div 
                    key={booking.id} 
                    className="flex items-center justify-between p-3 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
                    onClick={() => handleBookingClick(booking)}
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {booking.customer_name || 'Unknown Customer'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {booking.plate || 'N/A'} • {formatTime(booking.start_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-blue-600">
                        {booking.flight_number || 'No flight'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {booking.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Today's Departures */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Today's Departures</h2>
            <p className="text-sm text-gray-500">Cars leaving today</p>
          </div>
          <div className="p-6">
            {todayData.departures.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No departures today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayData.departures.slice(0, 10).map((booking) => (
                  <div 
                    key={booking.id} 
                    className="flex items-center justify-between p-3 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors"
                    onClick={() => handleBookingClick(booking)}
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {booking.customer_name || 'Unknown Customer'}
                      </p>
                      <p className="text-sm text-gray-600">
                        {booking.plate || 'N/A'} • {formatTime(booking.end_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-orange-600">
                        £{booking.money_received || '0.00'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {booking.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Currently Parked */}
      <div className="mt-6 bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Currently Parked</h2>
          <p className="text-sm text-gray-500">Cars currently in the car park</p>
        </div>
        <div className="p-6">
          {todayData.currentlyParked.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No cars currently parked</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayData.currentlyParked.map((booking) => (
                <div 
                  key={booking.id} 
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
                  onClick={() => handleBookingClick(booking)}
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {booking.customer_name || 'Unknown Customer'}
                    </p>
                    <p className="text-sm text-gray-600">
                      {booking.plate || 'N/A'} • Arrived {formatTime(booking.start_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-green-600">
                      Departs {formatTime(booking.end_at)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {booking.flight_number || 'No flight'}
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
