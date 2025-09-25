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
  AlertCircle
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
}

type BookingDetailModalProps = {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onBookingUpdated?: () => void
  tenantId?: string
}

export default function BookingDetailModal({ 
  booking, 
  open, 
  onOpenChange, 
  onBookingUpdated,
  tenantId
}: BookingDetailModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showExtendSheet, setShowExtendSheet] = useState(false)
  const [stripePublishableKey, setStripePublishableKey] = useState<string>('')

  if (!booking) return null

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
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
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
      onBookingUpdated?.()
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
    // Navigate to edit page or open edit modal
    toast.info('Edit booking functionality coming soon')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl backdrop-blur bg-white/90 shadow-2xl border-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Booking Details - {booking.reference}
          </DialogTitle>
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
                  <p className="text-sm">{booking.customer_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Email</label>
                  <p className="text-sm flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    {booking.customer_email}
                  </p>
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
                  <p className="text-sm font-mono bg-slate-100 px-2 py-1 rounded">
                    {booking.plate || 'Not provided'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">Flight Number</label>
                  <p className="text-sm flex items-center gap-2">
                    <Plane className="h-3 w-3" />
                    {booking.flight_number || 'Not provided'}
                  </p>
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
                  <p className="text-sm flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    {formatDate(booking.start_at)} at {formatTime(booking.start_at)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-600">End Date</label>
                  <p className="text-sm flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    {formatDate(booking.end_at)} at {formatTime(booking.end_at)}
                  </p>
                </div>
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
              {booking.notes && (
                <div>
                  <label className="text-sm font-medium text-slate-600">Notes</label>
                  <p className="text-sm bg-slate-50 p-3 rounded-md">{booking.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          {booking.status === 'reserved' && (
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

          {booking.status === 'checked_in' && (
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
                    onBookingUpdated?.()
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

