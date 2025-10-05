'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StatCard from '@/components/ui/StatCard'
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal'
import { CalendarDays, LogIn, LogOut, Search } from 'lucide-react'

type Booking = {
  id: string
  tenant_id: string
  reference: string
  customer_name: string
  customer_email: string
  plate: string
  start_at: string
  end_at: string
  status: string
  money_charged: number
  money_received: number
  flight_number: string | null
  notes: string | null
  source: string
  created_at: string
}

type TodayPageClientProps = {
  tenant: {
    id: string
    name: string
    slug: string
  }
  kpis: {
    arrivals: number
    departures: number
    checkedIn: number
    capacityLeft: number
  }
  arrivals: Booking[]
  departures: Booking[]
}

export default function TodayPageClient({ tenant, kpis, arrivals, departures }: TodayPageClientProps) {
  const router = useRouter()
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const handleBookingClick = (booking: Booking) => {
    setSelectedBooking(booking)
    setModalOpen(true)
  }

  const handleBookingUpdated = () => {
    router.refresh()
  }

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
          <StatCard label="Arrivals Today" value={kpis.arrivals} delta="+12" variant="success" rightSlot={<LogIn className="h-4 w-4 text-blue-500" />} />
          <StatCard label="Departures Today" value={kpis.departures} delta="+9" variant="danger" rightSlot={<LogOut className="h-4 w-4 text-danger-500" />} />
          <StatCard label="Currently Parked" value={kpis.checkedIn} variant="info" />
          <StatCard label="Capacity Remaining" value={kpis.capacityLeft} />
        </div>

        {/* Arrivals */}
        <section className="card-soft bg-gradient-to-br from-blue-50/40 to-blue-100/30">
          <div className="p-4 border-b border-blue-200/50">
            <h2 className="text-lg font-semibold text-blue-800">Arrivals</h2>
            <p className="text-sm text-blue-600">Today's incoming bookings</p>
          </div>
          <TableWithToolbar 
            placeholder="Search arrivals…" 
            rows={arrivals} 
            type="arrivals" 
            onBookingClick={handleBookingClick}
          />
        </section>

        {/* Departures */}
        <section className="card-soft bg-danger-50/20">
          <div className="p-4 border-b border-danger-200/50">
            <h2 className="text-lg font-semibold text-danger-800">Departures</h2>
            <p className="text-sm text-danger-600">Today's outgoing bookings</p>
          </div>
          <TableWithToolbar 
            placeholder="Search departures…" 
            rows={departures} 
            type="departures" 
            onBookingClick={handleBookingClick}
          />
        </section>
      </div>

      {selectedBooking && (
        <BookingDetailsModal
          booking={selectedBooking}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onBookingUpdated={handleBookingUpdated}
        />
      )}
    </>
  )
}

function TableWithToolbar({
  placeholder, 
  rows, 
  type,
  onBookingClick
}: { 
  placeholder: string
  rows: Booking[]
  type: 'arrivals' | 'departures'
  onBookingClick: (booking: Booking) => void
}) {
  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b bg-white">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <input placeholder={placeholder} className="pl-8 block w-full rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500" />
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500">
            <CalendarDays className="h-4 w-4 mr-2" /> Today
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <Th>Time</Th>
              <Th>Reference</Th>
              <Th>Customer</Th>
              <Th>Plate</Th>
              <Th>Flight</Th>
              <Th>Status</Th>
              <Th className="text-right pr-4">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="p-6 text-center text-gray-400">No {type} yet.</td></tr>
            ) : rows.map((r) => {
              const timeField = type === 'arrivals' ? r.start_at : r.end_at
              const time = new Date(timeField).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
              })
              return (
                <tr key={r.id} className="bg-white hover:bg-gray-50 cursor-pointer" onClick={() => onBookingClick(r)}>
                  <Td>{time}</Td>
                  <Td className="font-medium">{r.reference}</Td>
                  <Td>{r.customer_name}</Td>
                  <Td className="font-medium">{r.plate}</Td>
                  <Td>{r.flight_number && <span className="text-xs text-gray-500">{r.flight_number}</span>}</Td>
                  <Td>
                    {type === 'arrivals' ? (
                      <span className="badge badge-success">Arrival</span>
                    ) : (
                      <span className="badge badge-danger">Departure</span>
                    )}
                  </Td>
                  <Td className="text-right pr-4">
                    {type === 'arrivals' ? (
                      <button className="inline-flex items-center rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                        Check-in
                      </button>
                    ) : (
                      <button className="inline-flex items-center rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                        Check-out
                      </button>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Th({ children, className }: any) {
  return <th className={`px-3 py-2 text-left font-medium ${className ?? ''}`}>{children}</th>
}
function Td({ children, className }: any) {
  return <td className={`px-3 py-3 align-middle ${className ?? ''}`}>{children}</td>
}

