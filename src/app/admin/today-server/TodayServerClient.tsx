'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, Car, DollarSign } from 'lucide-react';
import BookingModal from '@/components/bookings/BookingModal';

interface Booking {
  id: string;
  reference: string;
  customer_name: string;
  customer_email: string;
  plate: string;
  start_at: string;
  end_at: string;
  status: string;
  money_received: number;
  money_charged: number;
  source: string;
  flight_number: string;
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
  kpis, 
  arrivals, 
  departures, 
  currentlyParked 
}: TodayServerClientProps) {
  const router = useRouter();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const handleBookingClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setModalOpen(true);
  };

  const handleBookingUpdated = () => {
    router.refresh();
  };

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
          {booking.customer_name}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900">
          {booking.plate}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900">
          {new Date(time).toLocaleTimeString('en-GB', { timeZone: 'UTC' })}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900">
          £{booking.money_received || 0}
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

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            label="Arrivals Today" 
            value={kpis.arrivals} 
            delta="+12" 
            variant="success" 
            rightSlot={<LogIn className="h-4 w-4 text-blue-500" />} 
          />
          <StatCard 
            label="Departures Today" 
            value={kpis.departures} 
            delta="+9" 
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
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Today's Revenue</h3>
          <p className="text-3xl font-bold text-green-600">£{kpis.totalRevenue.toFixed(2)}</p>
        </div>

        {/* Arrivals */}
        <section className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Arrivals</h2>
            <p className="text-sm text-gray-600">Today's incoming bookings</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {arrivals.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} type="arrival" />
                ))}
                {arrivals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No arrivals today
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
            <h2 className="text-lg font-semibold text-gray-900">Departures</h2>
            <p className="text-sm text-gray-600">Today's outgoing bookings</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {departures.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} type="departure" />
                ))}
                {departures.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No departures today
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
            <h2 className="text-lg font-semibold text-gray-900">Currently Parked</h2>
            <p className="text-sm text-gray-600">Cars currently in the parking lot</p>
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
                {currentlyParked.map((booking) => (
                  <BookingRow key={booking.id} booking={booking} type="parked" />
                ))}
                {currentlyParked.length === 0 && (
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
      {selectedBooking && (
        <BookingModal
          booking={selectedBooking as any}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onBookingUpdated={handleBookingUpdated}
        />
      )}
    </>
  );
}
