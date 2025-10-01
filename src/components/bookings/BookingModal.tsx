'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Plus,
  X,
  CheckCircle,
  AlertCircle,
  Save
} from 'lucide-react'
import { toast } from 'sonner'
import ExtendBookingSheet from './ExtendBookingSheet'

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

type BookingModalProps = {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onBookingUpdated?: (booking: Booking) => void
  tenantId?: string
}

export default function BookingModal({ 
  booking, 
  open, 
  onOpenChange, 
  onBookingUpdated,
  tenantId
}: BookingModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showExtendSheet, setShowExtendSheet] = useState(false)
  const [stripePublishableKey, setStripePublishableKey] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [mounted, setMounted] = useState(false)
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

  // Ensure component is mounted on client side
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!booking || !mounted) return null

  // Initialize edit form when booking changes
  useEffect(() => {
    if (booking) {
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
  }, [booking])

  // Fetch Stripe publishable key when modal opens
  useEffect(() => {
    if (open && tenantId) {
      fetch(`/api/tenant/secrets?tenantId=${tenantId}`)
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.publishableKey) {
            setStripePublishableKey(data.publishableKey)
          }
        })
        .catch(() => {
          // Stripe not configured
        })
    }
  }, [open, tenantId])

  const formatDate = (dateString: string) => {
    // Use consistent formatting to avoid hydration mismatches
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
    // Use consistent formatting to avoid hydration mismatches
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
      case 'reserved':
        return <Badge variant="outline">Reserved</Badge>
      case 'checked_in':
        return <Badge className="badge badge-success">Checked In</Badge>
      case 'checked_out':
        return <Badge className="badge badge-danger">Checked Out</Badge>
      case 'cancelled':
        return <Badge className="badge badge-danger">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
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

  const handleExtend = async () => {
    if (!tenantId) {
      toast.error('Tenant information not available')
      return
    }
    setShowExtendSheet(true)
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
      const updateData = {
        plate: editForm.plate,
        flight_number: editForm.flight_number,
        start_at: editForm.start_at,
        end_at: editForm.end_at,
        status: editForm.status,
        customer_name: editForm.customer_name,
        customer_email: editForm.customer_email,
        notes: editForm.notes
      }
      
      console.log('Updating booking with data:', updateData)
      console.log('Booking ID:', booking.id)
      
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error('Update failed:', error)
        throw new Error(error.error || `Failed to update booking (${response.status})`)
      }

      const updatedBooking = await response.json()
      toast.success('Booking updated successfully')
      onBookingUpdated?.(updatedBooking)
      setIsEditing(false)
    } catch (error: any) {
      toast.error(error.message || 'Failed to update booking')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
      setLoading(true)
      try {
        const response = await fetch('/api/bookings/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: booking.id }),
          credentials: 'include'
        })

        if (!response.ok) {
          throw new Error('Failed to delete booking')
        }

        toast.success('Booking deleted successfully')
        onBookingUpdated?.(booking)
        onOpenChange(false)
      } catch (error) {
        toast.error('Failed to delete booking')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl backdrop-blur bg-white/90 shadow-2xl border-0"
        aria-describedby="booking-modal-description"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Booking Details - {booking.reference}
          </DialogTitle>
          <p id="booking-modal-description" className="sr-only">
            View and edit booking details including customer information, vehicle details, dates, and payment information.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusBadge(booking.status)}
              <span className="text-sm text-slate-500">
                Created {formatDate(booking.created_at)}
              </span>
            </div>
            <div className="flex gap-2">
              {!isEditing ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEdit}
                    disabled={loading}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleExtend}
                    disabled={loading}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Extend
                  </Button>
                  {booking.status !== 'cancelled' && booking.status !== 'checked_out' && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleCancel}
                      disabled={loading}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={loading}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={loading}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(false)}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Customer Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-600">Name</label>
                  {isEditing ? (
                    <Input
                      value={editForm.customer_name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, customer_name: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm">{booking.customer_name}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Email</label>
                  {isEditing ? (
                    <Input
                      value={editForm.customer_email}
                      onChange={(e) => setEditForm(prev => ({ ...prev, customer_email: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm flex items-center gap-2">
                      <Mail className="h-3 w-3" />
                      {booking.customer_email}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Car className="h-4 w-4" />
                Vehicle Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-600">License Plate</label>
                  {isEditing ? (
                    <Input
                      value={editForm.plate}
                      onChange={(e) => setEditForm(prev => ({ ...prev, plate: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">
                      {booking.plate || 'Not provided'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Flight Number</label>
                  {isEditing ? (
                    <Input
                      value={editForm.flight_number}
                      onChange={(e) => setEditForm(prev => ({ ...prev, flight_number: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm flex items-center gap-2">
                      <Plane className="h-3 w-3" />
                      {booking.flight_number || 'Not provided'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Make & Model</label>
                  <p className="text-sm">
                    {booking.car_make && booking.car_model
                      ? `${booking.car_make} ${booking.car_model}`
                      : 'Not provided'
                    }
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Color</label>
                  <p className="text-sm">{booking.car_color || 'Not provided'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dates and Times */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Dates & Times
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-600">Start Date</label>
                  {isEditing ? (
                    <Input
                      type="datetime-local"
                      value={editForm.start_at}
                      onChange={(e) => setEditForm(prev => ({ ...prev, start_at: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {formatDate(booking.start_at)} at {formatTime(booking.start_at)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">End Date</label>
                  {isEditing ? (
                    <Input
                      type="datetime-local"
                      value={editForm.end_at}
                      onChange={(e) => setEditForm(prev => ({ ...prev, end_at: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {formatDate(booking.end_at)} at {formatTime(booking.end_at)}
                    </p>
                  )}
                </div>
                {isEditing && (
                  <div>
                    <label className="text-sm font-medium text-slate-600">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="reserved">Reserved</option>
                      <option value="checked_in">Checked In</option>
                      <option value="checked_out">Checked Out</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Payment Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-600">Amount Charged</label>
                  <p className="text-sm font-semibold">{formatCurrency(booking.money_charged)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Amount Received</label>
                  <p className="text-sm font-semibold">{formatCurrency(booking.money_received)}</p>
                </div>
              </div>
              {booking.money_charged !== booking.money_received && (
                <div className="flex items-center gap-2 text-amber-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  Payment discrepancy detected
                </div>
              )}
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-600">Source</label>
                  <p className="text-sm capitalize">{booking.source}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Booking ID</label>
                  <p className="text-sm font-mono text-slate-500">{booking.id}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-600">Notes</label>
                {isEditing ? (
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm bg-slate-50 p-3 rounded-md">{booking.notes || 'No notes'}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {booking.status === 'reserved' && !isEditing && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Ready for Check-in</span>
                </div>
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => handleStatusUpdate('checked_in')}
                  disabled={loading}
                >
                  Check In Customer
                </Button>
              </CardContent>
            </Card>
          )}

          {booking.status === 'checked_in' && !isEditing && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium text-green-800">Customer Checked In</span>
                </div>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleStatusUpdate('checked_out')}
                  disabled={loading}
                >
                  Check Out Customer
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Extension Sheet */}
          {showExtendSheet && tenantId && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Extend Booking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ExtendBookingSheet
                  tenantId={tenantId}
                  booking={{
                    id: booking.id,
                    end_at: booking.end_at,
                    flight_number: booking.flight_number,
                    reference: booking.reference
                  }}
                  publishableKey={stripePublishableKey}
                  onExtended={() => {
                    setShowExtendSheet(false)
                    onBookingUpdated?.(booking)
                    router.refresh()
                  }}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
