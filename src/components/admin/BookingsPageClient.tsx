'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import GlassCard from '@/components/ui/GlassCard'
import { Button } from '@/components/ui/button'
import { TableShell, Th, Td } from '@/components/admin/TableShell'
import EmptyState from '@/components/admin/EmptyState'
import { Plus, Search } from 'lucide-react'
import NewBookingDialog from '@/components/bookings/NewBookingDialog'
import BookingDetailsModal from '@/components/bookings/BookingDetailsModal'

type Booking = {
  id: string
  tenant_id: string
  reference: string
  customer_name: string
  customer_email: string
  plate: string
  car_make: string | null
  car_model: string | null
  car_color: string | null
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

type BookingsPageClientProps = {
  tenant: {
    id: string
    name: string
    slug: string
  }
  bookings: Booking[]
  dateRange: string
  setDateRange: (range: string) => void
  customStartDate: string
  setCustomStartDate: (date: string) => void
  customEndDate: string
  setCustomEndDate: (date: string) => void
}

export default function BookingsPageClient({ 
  tenant, 
  bookings, 
  dateRange, 
  setDateRange, 
  customStartDate, 
  setCustomStartDate, 
  customEndDate, 
  setCustomEndDate 
}: BookingsPageClientProps) {
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
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="panel-title">Bookings</h1>
              <p className="text-sm text-fg/60">
                Manage reservations across channels. 
                {bookings.length > 0 && (
                  <span className="ml-2 font-medium text-blue-600">
                    Showing {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>
            <NewBookingDialog tenantId={tenant.id} onCreated={handleBookingUpdated} />
          </div>
        </header>

        <GlassCard className="mb-6">
          <div className="space-y-4">
            <h2 className="panel-title">Filters</h2>
            
            {/* Date Range Filter */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex flex-col sm:flex-row gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                  <select 
                    value={dateRange} 
                    onChange={(e) => setDateRange(e.target.value)}
                    className="select max-w-[180px]"
                  >
                    <option value="all">All Bookings</option>
                    <option value="today">Today</option>
                    <option value="next7days">Next 7 Days</option>
                    <option value="next14days">Next 14 Days</option>
                    <option value="next30days">Next 30 Days</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                
                {dateRange === 'custom' && (
                  <div className="flex gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                      <input 
                        type="date" 
                        value={customStartDate} 
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                      <input 
                        type="date" 
                        value={customEndDate} 
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="input"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Other Filters */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 gap-3">
                <div className="relative w-full md:max-w-sm">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-fg/40" />
                  <input className="input pl-8" placeholder="Search by ref, name, email, plate..." />
                </div>
                <select className="select max-w-[180px]">
                  <option>All Status</option>
                  <option>Reserved</option>
                  <option>Checked-in</option>
                  <option>Checked-out</option>
                  <option>Cancelled</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="ghost"
                  onClick={() => {
                    setDateRange('all');
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                >
                  Reset
                </Button>
                <Button variant="default">Apply</Button>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <table className="table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Customer</th>
                <th>Email</th>
                <th>Plate</th>
                <th>Flight</th>
                <th>From</th>
                <th>To</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface/70">
              {bookings.map((r) => (
                <tr key={r.id} className="hover:bg-fg/3 transition-colors cursor-pointer" onClick={() => handleBookingClick(r)}>
                  <td className="font-medium">{r.reference}</td>
                  <td>{r.customer_name}</td>
                  <td className="text-fg/60">{r.customer_email}</td>
                  <td className="font-medium">{r.plate}</td>
                  <td className="text-fg/60">{r.flight_number || '-'}</td>
                  <td>{new Date(r.start_at).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</td>
                  <td>{new Date(r.end_at).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</td>
                  <td>
                    {r.status === 'checked_in' && <span className="badge">Checked-in</span>}
                    {r.status === 'checked_out' && <span className="badge">Checked-out</span>}
                    {r.status === 'reserved' && <span className="badge">Reserved</span>}
                    {r.status === 'cancelled' && <span className="badge">Cancelled</span>}
                  </td>
                  <td>
                    <Button 
                      className="px-3 py-1.5 text-xs" 
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleBookingClick(r)
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
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

