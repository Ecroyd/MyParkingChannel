'use client';

import { useState } from 'react';
import DemandCurve from '@/components/charts/DemandCurve';
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal';
import DateRangeModal from '@/components/admin/DateRangeModal';
import { useDateRangeModal } from '@/hooks/useDateRangeModal';
import { Calendar } from 'lucide-react';
import ExemptionsPanel from '../_components/ExemptionsPanel';
import FlightsToday from '../_components/FlightsToday';

interface DashboardClientProps {
  user: any;
  tenant: any;
  bookings: any[];
  recentBookings: any[];
  totalBookingsCount: number;
  capacityData: {
    totalCapacity: number;
    capacityRemaining: number;
  };
  revenueData: {
    todayRevenue: number;
    totalBookings: number;
  };
  chartData: Array<{
    date: string;
    in: number;
    out: number;
    capacity: number;
  }>;
}

export default function DashboardClient({
  user,
  tenant,
  bookings,
  recentBookings,
  totalBookingsCount,
  capacityData,
  revenueData,
  chartData
}: DashboardClientProps) {
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const { isOpen, currentDateRange, openModal, closeModal, handleDateRangeChange } = useDateRangeModal();

  const handleBookingClick = (booking: any) => {
    setSelectedBookingId(booking.id);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back, {user?.email}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            {tenant?.name} • {tenant?.slug}
          </div>
          {currentDateRange && (
            <div className="text-sm text-gray-600">
              {currentDateRange.from} to {currentDateRange.to}
            </div>
          )}
          <button
            onClick={openModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            <Calendar className="w-4 h-4" />
            Date Range
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-medium">📅</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Today&apos;s Bookings</p>
              <p className="text-2xl font-semibold text-gray-900">{revenueData.totalBookings}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-medium">💰</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Today&apos;s Revenue</p>
              <p className="text-2xl font-semibold text-gray-900">£{revenueData.todayRevenue.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-medium">🚗</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Capacity</p>
              <p className="text-2xl font-semibold text-gray-900">{capacityData.capacityRemaining} / {capacityData.totalCapacity}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                <span className="text-white text-sm font-medium">📊</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Bookings</p>
              <p className="text-2xl font-semibold text-gray-900">{totalBookingsCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Exemptions Panel */}
      <ExemptionsPanel />

      {/* Flights Today */}
      <FlightsToday />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Demand Curve</h3>
          <DemandCurve 
            tenantId={tenant.id}
            capacity={capacityData.totalCapacity}
            showCapacityLine={true}
          />
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Bookings</h3>
          <div className="space-y-3">
            {recentBookings.slice(0, 5).map((booking) => (
              <div
                key={booking.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                onClick={() => handleBookingClick(booking)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{booking.customer_name}</p>
                    {booking.is_incomplete && (
                      <span className="inline-flex px-1.5 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                        Incomplete
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{booking.plate}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">£{booking.money_charged || 0}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(booking.start_at).toLocaleDateString('en-GB', { timeZone: 'UTC' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Booking Details Modal */}
      {selectedBookingId && (
        <BookingDetailsModal
          booking={recentBookings.find(b => b.id === selectedBookingId) || null}
          open={!!selectedBookingId}
          onClose={() => setSelectedBookingId(null)}
          onBookingUpdated={() => {
            // Refresh the page to get updated data
            window.location.reload();
          }}
        />
      )}

      {/* Date Range Modal */}
      <DateRangeModal
        isOpen={isOpen}
        onClose={closeModal}
        onDateRangeChange={handleDateRangeChange}
        title="Select Date Range for Dashboard"
      />
    </div>
  );
}
