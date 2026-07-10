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
  Save,
  Phone,
} from 'lucide-react'
import { toast } from 'sonner'
import ExtendBookingSheet from './ExtendBookingSheet'
import { notifyBookingsChanged } from '@/lib/bookings/operational-state'

type Booking = {
  id: string
  reference: string
  customer_name: string
  customer_email: string
  customer_phone?: string
  phone?: string
  plate: string
  start_at: string
  end_at: string
  status: string
  money_charged: number
  money_received: number
  flight_number?: string
  return_flight_number?: string
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
  tenantTimezone?: string
}

function isoToDatetimeLocal(iso: string): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function datetimeLocalToIso(value: string): string {
  if (!value) return value
  if (value.includes('Z') || /[+-]\d{2}:\d{2}$/.test(value)) {
    return new Date(value).toISOString()
  }
  // datetime-local values are stored/displayed as UTC wall-clock times
  return new Date(`${value}:00.000Z`).toISOString()
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function BookingModal({ 
  booking, 
  open, 
  onOpenChange, 
  onBookingUpdated,
  tenantId,
  tenantTimezone = 'UTC',
}: BookingModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showExtendSheet, setShowExtendSheet] = useState(false)
  const [stripePublishableKey, setStripePublishableKey] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [localBooking, setLocalBooking] = useState<Booking | null>(booking)
  const [editForm, setEditForm] = useState({
    plate: '',
    flight_number: '',
    return_flight_number: '',
    start_at: '',
    end_at: '',
    status: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    notes: ''
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    setLocalBooking(booking)
    if (booking) {
      setEditForm({
        plate: booking.plate || '',
        flight_number: booking.flight_number || '',
        return_flight_number: booking.return_flight_number || '',
        start_at: isoToDatetimeLocal(booking.start_at),
        end_at: isoToDatetimeLocal(booking.end_at),
        status: booking.status || '',
        customer_name: booking.customer_name || '',
        customer_email: booking.customer_email || '',
        customer_phone: booking.customer_phone || booking.phone || '',
        notes: booking.notes || ''
      })
      setSaveState('idle')
      setSaveError(null)
    }
  }, [booking])

  useEffect(() => {
    if (open && tenantId) {
      let cancelled = false
      
      fetch(`/api/tenant/secrets?tenantId=${tenantId}`)
        .then(res => res.json())
        .then(data => {
          if (!cancelled && data.ok && data.publishableKey) {
            setStripePublishableKey(data.publishableKey)
          }
        })
        .catch(() => {})
      
      return () => {
        cancelled = true
      }
    }
  }, [open, tenantId])

  if (!mounted || !localBooking) return null

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: tenantTimezone,
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tenantTimezone,
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
      case 'no_show':
        return <Badge className="badge badge-danger">No Show</Badge>
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
          bookingId: localBooking.id,
          status: newStatus
        }),
        credentials: 'include'
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update booking status')
      }

      const updated = result.booking as Booking
      if (!updated?.id) {
        throw new Error('Update did not return a booking row')
      }

      setLocalBooking((prev) => (prev ? { ...prev, ...updated, status: newStatus } : prev))
      toast.success(`Booking ${newStatus.replace(/_/g, ' ')} successfully`)
      notifyBookingsChanged()
      onBookingUpdated?.({ ...localBooking, ...updated, status: newStatus })
      router.refresh()
      onOpenChange(false)
    } catch (error: any) {
      toast.error(error.message || 'Failed to update booking status')
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

  const handleNoShow = async () => {
    if (confirm('Mark this booking as a no-show?')) {
      await handleStatusUpdate('no_show')
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
    setSaveState('idle')
    setSaveError(null)
  }

  const handleSaveEdit = async () => {
    setSaveState('saving')
    setSaveError(null)
    setLoading(true)
    try {
      const updateData = {
        plate: editForm.plate,
        flight_number: editForm.flight_number,
        return_flight_number: editForm.return_flight_number,
        start_at: datetimeLocalToIso(editForm.start_at),
        end_at: datetimeLocalToIso(editForm.end_at),
        status: editForm.status,
        customer_name: editForm.customer_name,
        customer_email: editForm.customer_email,
        customer_phone: editForm.customer_phone,
        notes: editForm.notes
      }
      
      const response = await fetch(`/api/bookings/${localBooking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
        credentials: 'include',
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || `Failed to update booking (${response.status})`)
      }

      if (!result?.id) {
        throw new Error('Save did not return the updated booking')
      }

      const updatedBooking = result as Booking
      setLocalBooking(updatedBooking)
      setSaveState('saved')
      toast.success('Booking updated')
      notifyBookingsChanged()
      onBookingUpdated?.(updatedBooking)
      router.refresh()
      setIsEditing(false)
    } catch (error: any) {
      setSaveState('error')
      setSaveError(error.message || 'Failed to update booking')
      toast.error(error.message || 'Failed to update booking')
    } finally {
      setLoading(false)
    }
  }

  const saveButtonLabel =
    saveState === 'saving' ? 'Saving…' :
    saveState === 'saved' ? 'Booking updated ✓' :
    'Save changes'

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this booking? This action cannot be undone.')) {
      setLoading(true)
      try {
        const response = await fetch('/api/bookings/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: localBooking.id }),
          credentials: 'include'
        })

        if (!response.ok) {
          throw new Error('Failed to delete booking')
        }

        toast.success('Booking deleted successfully')
        notifyBookingsChanged()
        onBookingUpdated?.(localBooking)
        onOpenChange(false)
        router.refresh()
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
            Booking Details - {localBooking.reference}
          </DialogTitle>
          <p id="booking-modal-description" className="sr-only">
            View and edit booking details including customer information, vehicle details, dates, and payment information.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusBadge(localBooking.status)}
              <span className="text-sm text-slate-500">
                Created {formatDate(localBooking.created_at)}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {!isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={handleEdit} disabled={loading}>
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
                  {localBooking.status !== 'cancelled' && localBooking.status !== 'checked_out' && localBooking.status !== 'no_show' && (
                    <>
                      <Button variant="destructive" size="sm" onClick={handleCancel} disabled={loading}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      {localBooking.status === 'reserved' && (
                        <Button variant="outline" size="sm" onClick={handleNoShow} disabled={loading}>
                          No-show
                        </Button>
                      )}
                    </>
                  )}
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
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
                    disabled={loading || saveState === 'saving'}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saveButtonLabel}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsEditing(false)
                      setSaveState('idle')
                      setSaveError(null)
                    }}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>

          {saveError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {saveError}
            </div>
          )}

          <Separator />

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
                    <p className="text-sm">{localBooking.customer_name}</p>
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
                      {localBooking.customer_email}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Telephone</label>
                  {isEditing ? (
                    <Input
                      value={editForm.customer_phone}
                      onChange={(e) => setEditForm(prev => ({ ...prev, customer_phone: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm flex items-center gap-2">
                      <Phone className="h-3 w-3" />
                      {localBooking.customer_phone || localBooking.phone || 'Not provided'}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

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
                      {localBooking.plate || 'Not provided'}
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
                      {localBooking.flight_number || 'Not provided'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Return Flight</label>
                  {isEditing ? (
                    <Input
                      value={editForm.return_flight_number}
                      onChange={(e) => setEditForm(prev => ({ ...prev, return_flight_number: e.target.value }))}
                      className="mt-1"
                    />
                  ) : (
                    <p className="text-sm">
                      {localBooking.return_flight_number || 'Not provided'}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

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
                      {formatDate(localBooking.start_at)} at {formatTime(localBooking.start_at)}
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
                      {formatDate(localBooking.end_at)} at {formatTime(localBooking.end_at)}
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
                      <option value="no_show">No Show</option>
                    </select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

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
                  <p className="text-sm font-semibold">{formatCurrency(localBooking.money_charged)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Amount Received</label>
                  <p className="text-sm font-semibold">{formatCurrency(localBooking.money_received)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {localBooking.status === 'reserved' && !isEditing && (
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
                  Arrived
                </Button>
              </CardContent>
            </Card>
          )}

          {localBooking.status === 'checked_in' && !isEditing && (
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
                  Departed
                </Button>
              </CardContent>
            </Card>
          )}

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
                    id: localBooking.id,
                    end_at: localBooking.end_at,
                    flight_number: localBooking.flight_number,
                    reference: localBooking.reference
                  }}
                  publishableKey={stripePublishableKey}
                  onExtended={() => {
                    setShowExtendSheet(false)
                    notifyBookingsChanged()
                    onBookingUpdated?.(localBooking)
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
