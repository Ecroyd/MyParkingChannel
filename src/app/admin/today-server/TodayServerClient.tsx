'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, LogOut, Car } from 'lucide-react';
import BookingModal from '@/components/bookings/BookingModal';
import NewBookingDialog from '@/components/bookings/NewBookingDialog';
import { PlateBadge } from '@/components/admin/PlateBadge';
import { PhoneLink } from '@/components/admin/PhoneLink';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  getCustomerPhone,
  getDepartureFlight,
  notifyBookingsChanged,
  type OperationalBooking,
} from '@/lib/bookings/operational-state';
import { useBookingRealtime } from '@/hooks/useBookingRealtime';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  default_capacity: number;
}

interface KPIs {
  arrivalsRemaining: number;
  departuresRemaining: number;
  currentlyParked: number;
  capacityLeft: number;
  totalRevenue: number;
}

interface TodayServerClientProps {
  tenant: Tenant;
  kpis: KPIs;
  arrivals: OperationalBooking[];
  departures: OperationalBooking[];
  currentlyParked: OperationalBooking[];
}

function formatTime(iso: string, timezone: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    reserved: 'bg-yellow-100 text-yellow-800',
    checked_in: 'bg-green-100 text-green-800',
    checked_out: 'bg-gray-100 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
    no_show: 'bg-orange-100 text-orange-800',
  };
  return map[status] || 'bg-gray-100 text-gray-800';
}

export default function TodayServerClient({
  tenant,
  kpis,
  arrivals,
  departures,
  currentlyParked,
}: TodayServerClientProps) {
  const router = useRouter();
  const [selectedBooking, setSelectedBooking] = useState<OperationalBooking | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [parkedOpen, setParkedOpen] = useState(false);

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useBookingRealtime(tenant.id, refresh);

  const handleBookingClick = (booking: OperationalBooking) => {
    setSelectedBooking(booking);
    setModalOpen(true);
  };

  const handleBookingUpdated = () => {
    notifyBookingsChanged();
    refresh();
  };

  const StatCard = ({
    label,
    value,
    onClick,
    rightSlot,
  }: {
    label: string;
    value: number;
    onClick?: () => void;
    rightSlot?: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`bg-white rounded-lg border border-gray-200 p-4 text-left w-full ${
        onClick ? 'hover:border-blue-300 hover:shadow-sm cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        {rightSlot && <div className="flex-shrink-0">{rightSlot}</div>}
      </div>
    </button>
  );

  const OperationalTable = ({
    rows,
    mode,
  }: {
    rows: OperationalBooking[];
    mode: 'arrivals' | 'departures';
  }) => (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[7rem]">Number plate</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Telephone</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {mode === 'arrivals' ? 'Flight' : 'Return flight'}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status / actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.map((booking) => {
              const timeIso = mode === 'arrivals' ? booking.start_at : booking.end_at;
              const flight =
                mode === 'arrivals'
                  ? booking.flight_number?.trim() || '—'
                  : getDepartureFlight(booking) || '—';
              return (
                <tr
                  key={booking.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleBookingClick(booking)}
                >
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {formatTime(timeIso, tenant.timezone)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">{booking.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <PlateBadge plate={booking.plate} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <PhoneLink phone={getCustomerPhone(booking)} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{flight}</td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClass(booking.status)}`}>
                        {statusLabel(booking.status)}
                      </span>
                      {mode === 'arrivals' && booking.status === 'reserved' && (
                        <Button size="sm" variant="outline" onClick={() => handleBookingClick(booking)}>
                          Arrived
                        </Button>
                      )}
                      {mode === 'departures' && booking.status === 'checked_in' && (
                        <Button size="sm" variant="outline" onClick={() => handleBookingClick(booking)}>
                          Departed
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No {mode} today
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-gray-500">No {mode} today</p>
        ) : (
          rows.map((booking) => {
            const timeIso = mode === 'arrivals' ? booking.start_at : booking.end_at;
            const flight =
              mode === 'arrivals'
                ? booking.flight_number?.trim() || '—'
                : getDepartureFlight(booking) || '—';
            return (
              <button
                key={booking.id}
                type="button"
                className="w-full text-left p-4 hover:bg-gray-50 space-y-2"
                onClick={() => handleBookingClick(booking)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-900">{booking.customer_name || '—'}</span>
                  <span className="text-sm text-gray-600">{formatTime(timeIso, tenant.timezone)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <PlateBadge plate={booking.plate} />
                  <PhoneLink phone={getCustomerPhone(booking)} />
                </div>
                <div className="text-sm text-gray-600">
                  {mode === 'arrivals' ? 'Flight' : 'Return flight'}: {flight}
                </div>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClass(booking.status)}`}>
                  {statusLabel(booking.status)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Today&apos;s Overview</h1>
            <p className="text-gray-600">Welcome to {tenant.name}</p>
          </div>
          <NewBookingDialog tenantId={tenant.id} onCreated={handleBookingUpdated} label="Add booking" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Arrivals remaining"
            value={kpis.arrivalsRemaining}
            rightSlot={<LogIn className="h-4 w-4 text-blue-500" />}
          />
          <StatCard
            label="Departures remaining"
            value={kpis.departuresRemaining}
            rightSlot={<LogOut className="h-4 w-4 text-red-500" />}
          />
          <StatCard
            label="Currently parked"
            value={kpis.currentlyParked}
            onClick={() => setParkedOpen(true)}
            rightSlot={<Car className="h-4 w-4 text-blue-500" />}
          />
          <StatCard label="Capacity remaining" value={kpis.capacityLeft} />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Today&apos;s Revenue</h3>
          <p className="text-3xl font-bold text-green-600">£{kpis.totalRevenue.toFixed(2)}</p>
        </div>

        <section className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Arrivals</h2>
            <p className="text-sm text-gray-600">Today&apos;s incoming bookings</p>
          </div>
          <OperationalTable rows={arrivals} mode="arrivals" />
        </section>

        <section className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Departures</h2>
            <p className="text-sm text-gray-600">Today&apos;s outgoing bookings</p>
          </div>
          <OperationalTable rows={departures} mode="departures" />
        </section>
      </div>

      <Dialog open={parkedOpen} onOpenChange={setParkedOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Currently parked ({currentlyParked.length})</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto divide-y">
            {currentlyParked.length === 0 ? (
              <p className="py-6 text-center text-gray-500">No vehicles currently on site.</p>
            ) : (
              currentlyParked.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  className="w-full text-left py-3 hover:bg-gray-50 px-1"
                  onClick={() => {
                    setParkedOpen(false);
                    handleBookingClick(booking);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{booking.customer_name || '—'}</span>
                    <PlateBadge plate={booking.plate} />
                  </div>
                  <div className="mt-1 text-sm text-gray-600 flex flex-wrap gap-x-3">
                    <span>Arrived {formatTime(booking.start_at, tenant.timezone)}</span>
                    <span>Ref {booking.reference || '—'}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedBooking && (
        <BookingModal
          booking={selectedBooking as any}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onBookingUpdated={handleBookingUpdated}
          tenantId={tenant.id}
          tenantTimezone={tenant.timezone}
        />
      )}
    </>
  );
}
