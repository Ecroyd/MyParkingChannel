'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { CheckCircle, Clock, Search, User, Car } from 'lucide-react'
import { format, parseISO } from 'date-fns'

interface Booking {
  id: string
  reference: string
  customer_name: string
  customer_email: string
  plate: string
  car_make?: string
  car_model?: string
  start_at: string
  end_at: string
  status: string
  money_charged: number
  money_received: number
}

interface ArrivalsTableProps {
  tenantSlug: string
  onBookingUpdate?: (booking: Booking) => void
}

export function ArrivalsTable({ tenantSlug, onBookingUpdate }: ArrivalsTableProps) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([])

  useEffect(() => {
    async function fetchArrivals() {
      try {
        const response = await fetch('/api/admin/today/arrivals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tenant: tenantSlug })
        })

        if (response.ok) {
          const data = await response.json()
          setBookings(data)
        }
      } catch (error) {
        console.error('Failed to fetch arrivals:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchArrivals()
  }, [tenantSlug])

  useEffect(() => {
    const filtered = bookings.filter(booking =>
      booking.reference.toLowerCase().includes(search.toLowerCase()) ||
      booking.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      booking.customer_email.toLowerCase().includes(search.toLowerCase()) ||
      booking.plate.toLowerCase().includes(search.toLowerCase())
    )
    setFilteredBookings(filtered)
  }, [bookings, search])

  const handleCheckIn = async (booking: Booking) => {
    try {
      const response = await fetch('/api/bookings/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: booking.id,
          status: 'checked_in'
        })
      })

      if (response.ok) {
        const updatedBooking = { ...booking, status: 'checked_in' }
        setBookings(prev => prev.map(b => b.id === booking.id ? updatedBooking : b))
        onBookingUpdate?.(updatedBooking)
      }
    } catch (error) {
      console.error('Failed to check in booking:', error)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'reserved':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Reserved</Badge>
      case 'checked_in':
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Checked In</Badge>
      case 'checked_out':
        return <Badge variant="outline">Checked Out</Badge>
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today's Arrivals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Today's Arrivals</CardTitle>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search arrivals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredBookings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No arrivals found
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBookings.map((booking) => (
              <div key={booking.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="font-medium">{booking.reference}</div>
                      <div className="text-sm text-muted-foreground">
                        {format(parseISO(booking.start_at), 'HH:mm')} - {format(parseISO(booking.end_at), 'HH:mm')}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{booking.customer_name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Car className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{booking.plate}</span>
                      {booking.car_make && (
                        <span className="text-sm text-muted-foreground">
                          {booking.car_make} {booking.car_model}
                        </span>
                      )}
                    </div>
                    {getStatusBadge(booking.status)}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {booking.status === 'reserved' && (
                    <Button
                      size="sm"
                      onClick={() => handleCheckIn(booking)}
                    >
                      Check In
                    </Button>
                  )}
                  <Button variant="outline" size="sm">
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

