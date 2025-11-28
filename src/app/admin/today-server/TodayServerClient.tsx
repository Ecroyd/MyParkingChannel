'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, Car, DollarSign, ArrowUpDown } from 'lucide-react';
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal';
import DateRangeSelector from '@/components/admin/DateRangeSelector';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface Booking {
  id: string;
  tenant_id: string;
  reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  plate: string;
  car_make: string | null;
  car_model: string | null;
  car_color: string | null;
  start_at: string;
  end_at: string;
  status: string;
  money_received: number;
  money_charged: number;
  source: string;
  flight_number: string;
  notes: string | null;
  stripe_payment_intent_id?: string | null;
  payment_status?: string | null;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  default_capacity: number;
}

interface KPIs {
  arrivals: number;
  departures: number;
  checkedIn: number;
  capacityLeft: number;
  totalRevenue: number;
}

interface TodayServerClientProps {
  tenant: Tenant;
  kpis: KPIs;
  arrivals: Booking[];
  departures: Booking[];
  currentlyParked: Booking[];
}

export default function TodayServerClient({ 
  tenant, 
  kpis: initialKpis, 
  arrivals: initialArrivals, 
  departures: initialDepartures, 
  currentlyParked: initialCurrentlyParked 
}: TodayServerClientProps) {
  const router = useRouter();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState(initialKpis);
  const [arrivals, setArrivals] = useState(initialArrivals);
  const [departures, setDepartures] = useState(initialDepartures);
  const [currentlyParked, setCurrentlyParked] = useState(initialCurrentlyParked);
  const [arrivalsSort, setArrivalsSort] = useState<'closest' | 'most_recent'>('closest');
  const [departuresSort, setDeparturesSort] = useState<'closest' | 'most_recent'>('closest');
  const [parkedSort, setParkedSort] = useState<'closest' | 'most_recent'>('closest');

  const handleBookingClick = (booking: Booking) => {
    setSelectedBookingId(booking.id);
  };

  const handleBookingUpdated = () => {
    router.refresh();
  };

  const fetchDataForDateRange = async (from: string, to: string) => {
    // Clear previous data
    setKpis({ arrivals: 0, departures: 0, checkedIn: 0, capacityLeft: 0, totalRevenue: 0 });
    setArrivals([]);
    setDepartures([]);
    setCurrentlyParked([]);
    setLoading(true);
    
    try {
      const response = await fetch(`/api/admin/today?from=${from}&to=${to}`, { 
        cache: "no-store" 
      });
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      const data = await response.json();
      
      setKpis(data.kpis);
      setArrivals(data.arrivals);
      setDepartures(data.departures);
      setCurrentlyParked(data.currentlyParked);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateRangeChange = (dateRange: { from: string; to: string }) => {
    fetchDataForDateRange(dateRange.from, dateRange.to);
  };

  const sortBookings = (bookings: Booking[], sortOrder: 'closest' | 'most_recent', dateField: 'start_at' | 'end_at') => {
    const sorted = [...bookings];
    sorted.sort((a, b) => {
      const dateA = new Date(a[dateField]).getTime();
      const dateB = new Date(b[dateField]).getTime();
      
      if (sortOrder === 'closest') {
        // Closest date first (ascending)
        return dateA - dateB;
      } else {
        // Most recent first (descending)
        return dateB - dateA;
      }
    });
    return sorted;
  };

  const sortedArrivals = useMemo(() => {
    return sortBookings(arrivals, arrivalsSort, 'start_at');
  }, [arrivals, arrivalsSort]);

  const sortedDepartures = useMemo(() => {
    return sortBookings(departures, departuresSort, 'end_at');
  }, [departures, departuresSort]);

  const sortedCurrentlyParked = useMemo(() => {
    return sortBookings(currentlyParked, parkedSort, 'start_at');
  }, [currentlyParked, parkedSort]);

  const StatCard = ({ label, value, delta, variant, rightSlot }: {
    label: string;
    value: number;
    delta?: string;
    variant?: 'success' | 'danger' | 'info' | 'warning';
    rightSlot?: React.ReactNode;
  }) => {
    const variantClasses = {
      success: 'text-green-600 bg-green-50',
      danger: 'text-red-600 bg-red-50',
      info: 'text-blue-600 bg-blue-50',
      warning: 'text-yellow-600 bg-yellow-50'
    };

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {delta && (
              <p className={`text-sm ${variantClasses[variant || 'info']}`}>
                {delta}
              </p>
            )}
          </div>
          {rightSlot && (
            <div className="flex-shrink-0">
              {rightSlot}
            </div>
          )}
        </div>
      </div>
    );
  };

  const BookingRow = ({ booking, type }: { booking: Booking; type: 'arrival' | 'departure' | 'parked' }) => {
    const time = type === 'arrival' ? booking.start_at : booking.end_at;
    const statusColor = {
      'reserved': 'bg-yellow-100 text-yellow-800',
      'checked_in': 'bg-green-100 text-green-800',
      'checked_out': 'bg-gray-100 text-gray-800',
      'cancelled': 'bg-red-100 text-red-800'
    }[booking.status] || 'bg-gray-100 text-gray-800';

    return (
      <tr 
        className="hover:bg-gray-50 cursor-pointer"
        onClick={() => handleBookingClick(booking)}
      >
        <td className="px-4 py-3 text-sm font-medium text-gray-900">
          {booking.reference}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900">
          <div className="flex items-center gap-2">
            {booking.customer_name}
            {(booking as any).is_incomplete && (
              <span className="inline-flex px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                Incomplete
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-900">
          {booking.plate}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900">
          {new Date(time).toLocaleString('en-GB', { 
            timeZone: 'UTC',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900">
          £{booking.money_charged || 0}
        </td>
        <td className="px-4 py-3">
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColor}`}>
            {booking.status.replace('_', ' ')}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Today's Overview</h1>
            <p className="text-gray-600">Welcome to {tenant.name}</p>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="max-w-xs">
          <DateRangeSelector onDateRangeChange={handleDateRangeChange} />
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">Loading data...</span>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="Arrivals" 
            value={kpis.arrivals} 
            variant="success" 
            rightSlot={<LogIn className="h-4 w-4 text-blue-500" />} 
          />
          <StatCard 
            label="Departures" 
            value={kpis.departures} 
            variant="danger" 
            rightSlot={<LogOut className="h-4 w-4 text-red-500" />} 
          />
          <StatCard 
            label="Currently Parked" 
            value={kpis.checkedIn} 
            variant="info" 
            rightSlot={<Car className="h-4 w-4 text-blue-500" />}
          />
          <StatCard 
            label="Capacity Remaining" 
            value={kpis.capacityLeft}
            rightSlot={<DollarSign className="h-4 w-4 text-green-500" />}
          />
        </div>

        {/* Revenue Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Revenue</h3>
          <p className="text-3xl font-bold text-green-600">£{kpis.totalRevenue.toFixed(2)}</p>
        </div>

        {/* Arrivals */}
        <section className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Arrivals</h2>
                <p className="text-sm text-gray-600">Incoming bookings</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="arrivalsSort" className="text-sm text-gray-600">Sort:</Label>
                <Select value={arrivalsSort} onValueChange={(value: 'closest' | 'most_recent') => setArrivalsSort(value)}>
                  <SelectTrigger className="w-[140px]">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4 text-gray-400" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closest">Closest First</SelectItem>
                    <SelectItem value="most_recent">Most Recent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedArrivals.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} type="arrival" />
                ))}
                {sortedArrivals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No arrivals in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Departures */}
        <section className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Departures</h2>
                <p className="text-sm text-gray-600">Outgoing bookings</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="departuresSort" className="text-sm text-gray-600">Sort:</Label>
                <Select value={departuresSort} onValueChange={(value: 'closest' | 'most_recent') => setDeparturesSort(value)}>
                  <SelectTrigger className="w-[140px]">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4 text-gray-400" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closest">Closest First</SelectItem>
                    <SelectItem value="most_recent">Most Recent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedDepartures.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} type="departure" />
                ))}
                {sortedDepartures.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No departures in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Currently Parked */}
        <section className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Currently Parked</h2>
                <p className="text-sm text-gray-600">Cars currently in the parking lot</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="parkedSort" className="text-sm text-gray-600">Sort:</Label>
                <Select value={parkedSort} onValueChange={(value: 'closest' | 'most_recent') => setParkedSort(value)}>
                  <SelectTrigger className="w-[140px]">
                    <div className="flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4 text-gray-400" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closest">Closest First</SelectItem>
                    <SelectItem value="most_recent">Most Recent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Arrived</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedCurrentlyParked.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} type="parked" />
                ))}
                {sortedCurrentlyParked.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No cars currently parked
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Booking Details Modal */}
      {selectedBookingId && (
        <BookingDetailsModal
          booking={[...sortedArrivals, ...sortedDepartures, ...sortedCurrentlyParked].find(b => b.id === selectedBookingId) || null}
          open={!!selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onBookingUpdated={() => {
            router.refresh();
          }}
        />
      )}
    </>
  );
}
