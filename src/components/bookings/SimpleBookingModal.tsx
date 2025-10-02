'use client'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { 
  Calendar, 
  Clock, 
  User, 
  Mail, 
  Car, 
  Plane, 
  CreditCard,
  FileText,
  Edit,
  Save,
  X,
  Trash2
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type Booking = {
  id: string
  reference: string
  customer_name: string
  customer_email: string
  plate: string
  start_at: string
  end_at: string
  status: string
  money_charged: number
  money_received: number
  flight_number?: string
  notes?: string
  source: string
  created_at: string
  tenant_id?: string
  car_make?: string
  car_model?: string
  car_color?: string
  channel?: string
}

type SimpleBookingModalProps = {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onBookingUpdated?: (booking: Booking) => void
  tenantId?: string
}

export default function SimpleBookingModal({ 
  booking, 
  open, 
  onOpenChange, 
  onBookingUpdated,
  tenantId
}: SimpleBookingModalProps) {
  const [loading, setLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    plate: '',
    flight_number: '',
    start_at: '',
    end_at: '',
    status: '',
    customer_name: '',
    customer_email: '',
    notes: ''
  })

  if (!booking) return null

  // Initialize edit form when booking changes
  if (isEditing && editForm.plate === '') {
    setEditForm({
      plate: booking.plate || '',
      flight_number: booking.flight_number || '',
      start_at: booking.start_at.slice(0, 16),
      end_at: booking.end_at.slice(0, 16),
      status: booking.status || '',
      customer_name: booking.customer_name || '',
      customer_email: booking.customer_email || '',
      notes: booking.notes || ''
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC'
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-800">Confirmed</Badge>
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800">Completed</Badge>
      case 'no_show':
        return <Badge className="bg-yellow-100 text-yellow-800">No Show</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>
    }
  }

  const handleStatusUpdate = async (newStatus: string) => {
    setLoading(true)
    try {
      const response = await fetch('/api/bookings/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          status: newStatus
        }),
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to update booking status')
      }

      toast.success(`Booking ${newStatus.replace('_', ' ')} successfully`)
      onBookingUpdated?.(booking)
      onOpenChange(false)
    } catch (error) {
      toast.error('Failed to update booking status')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async () => {
    if (confirm('Are you sure you want to cancel this booking?')) {
      await handleStatusUpdate('cancelled')
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSaveEdit = async () => {
    setLoading(true)
    try {
      console.log('Sending edit data:', editForm)
      console.log('Booking ID:', booking.id)
      
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
        credentials: 'include'
      })

      console.log('Response status:', response.status)
      console.log('Response headers:', response.headers)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Error response:', errorData)
        throw new Error(errorData.error || 'Failed to update booking')
      }

      const updatedBooking = await response.json()
      console.log('Updated booking:', updatedBooking)
      toast.success('Booking updated successfully')
      onBookingUpdated?.(updatedBooking)
      setIsEditing(false)
    } catch (error) {
      console.error('Edit error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update booking')
    } finally {
      setLoading(false)
    }
  }

  const handleExtend = () => {
    // For now, just show a message - you can implement extend functionality later
    toast.info('Extend functionality coming soon')
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete booking')
      }

      toast.success('Booking deleted successfully')
      onBookingUpdated?.(booking)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete booking')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Booking Details - {booking.reference}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusBadge(booking.status)}
              <span className="text-sm text-gray-500">
                Created {formatDate(booking.created_at)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                disabled={loading}
              >
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExtend}
                disabled={loading}
              >
                Extend
              </Button>
              {booking.status === 'confirmed' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  Cancel Booking
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={loading}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>

          {/* Customer Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="customer_name">Name</Label>
                    <Input
                      id="customer_name"
                      value={editForm.customer_name}
                      onChange={(e) => setEditForm({...editForm, customer_name: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="customer_email">Email</Label>
                    <Input
                      id="customer_email"
                      type="email"
                      value={editForm.customer_email}
                      onChange={(e) => setEditForm({...editForm, customer_email: e.target.value})}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Name</label>
                    <p className="text-sm">{booking.customer_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Email</label>
                    <p className="text-sm">{booking.customer_email}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vehicle Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="w-4 h-4" />
                Vehicle Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="plate">Plate</Label>
                    <Input
                      id="plate"
                      value={editForm.plate}
                      onChange={(e) => setEditForm({...editForm, plate: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="flight_number">Flight Number</Label>
                    <Input
                      id="flight_number"
                      value={editForm.flight_number}
                      onChange={(e) => setEditForm({...editForm, flight_number: e.target.value})}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Plate</label>
                    <p className="text-sm font-mono">{booking.plate}</p>
                  </div>
                  {booking.flight_number && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Flight</label>
                      <p className="text-sm">{booking.flight_number}</p>
                    </div>
                  )}
                  {booking.car_make && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Make</label>
                      <p className="text-sm">{booking.car_make}</p>
                    </div>
                  )}
                  {booking.car_model && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Model</label>
                      <p className="text-sm">{booking.car_model}</p>
                    </div>
                  )}
                  {booking.car_color && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Color</label>
                      <p className="text-sm">{booking.car_color}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Booking Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Booking Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isEditing ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="start_at">Start Date & Time</Label>
                    <Input
                      id="start_at"
                      type="datetime-local"
                      value={editForm.start_at}
                      onChange={(e) => setEditForm({...editForm, start_at: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="end_at">End Date & Time</Label>
                    <Input
                      id="end_at"
                      type="datetime-local"
                      value={editForm.end_at}
                      onChange={(e) => setEditForm({...editForm, end_at: e.target.value})}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Start</label>
                    <p className="text-sm">{formatDate(booking.start_at)}</p>
                    <p className="text-xs text-gray-400">{formatTime(booking.start_at)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">End</label>
                    <p className="text-sm">{formatDate(booking.end_at)}</p>
                    <p className="text-xs text-gray-400">{formatTime(booking.end_at)}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Payment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Amount Charged</label>
                  <p className="text-sm font-semibold">{formatCurrency(booking.money_charged)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Amount Received</label>
                  <p className="text-sm font-semibold">{formatCurrency(booking.money_received)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Source</label>
                  <p className="text-sm">{booking.source}</p>
                </div>
                {booking.channel && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Channel</label>
                    <p className="text-sm">{booking.channel}</p>
                  </div>
                )}
              </div>
              {isEditing ? (
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Input
                    id="notes"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                    placeholder="Add notes..."
                  />
                </div>
              ) : (
                booking.notes && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Notes</label>
                    <p className="text-sm bg-gray-50 p-3 rounded">{booking.notes}</p>
                  </div>
                )
              )}
            </CardContent>
          </Card>

          {/* Edit Mode Actions */}
          {isEditing && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={loading}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={loading}
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
