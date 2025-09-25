"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import ExtendBookingSheet from './ExtendBookingSheet';

type Booking = {
  id: string
  tenant_id: string
  reference?: string
  customer_name?: string
  customer_email?: string
  plate?: string
  flight_number?: string
  start_at: string
  end_at: string
  status?: string
  source?: string
  money_received?: number
  money_charged?: number
  car_make?: string
  car_model?: string
  channel?: string
}

export default function BookingDetailsModal({
  open, onClose, booking, onUpdated, tenantId,
}: {
  open: boolean
  onClose: () => void
  booking: Booking | null
  onUpdated?: (b: Booking) => void
  tenantId?: string
}) {
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showExtendSheet, setShowExtendSheet] = useState(false)
  const [stripePublishableKey, setStripePublishableKey] = useState<string>('')

  const [form, setForm] = useState({
    plate: booking?.plate ?? '',
    flight_number: booking?.flight_number ?? '',
    start_at: booking?.start_at?.slice(0,16) ?? '',
    end_at: booking?.end_at?.slice(0,16) ?? '',
    status: booking?.status ?? '',
  })

  // Keep form in sync when booking changes
  useEffect(() => {
    if (booking) {
      setForm({
        plate: booking.plate ?? '',
        flight_number: booking.flight_number ?? '',
        start_at: booking.start_at.slice(0,16),
        end_at: booking.end_at.slice(0,16),
        status: booking.status ?? '',
      })
    }
  }, [booking])

  // Fetch Stripe publishable key when modal opens
  useEffect(() => {
    if (open && (tenantId || booking?.tenant_id)) {
      const id = tenantId || booking?.tenant_id
      fetch(`/api/tenant/secrets?tenantId=${id}`)
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
  }, [open, tenantId, booking?.tenant_id])

  const save = async (patch: Partial<Booking>) => {
    if (!booking) return
    setBusy(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `Update failed (${res.status})`)
      }
      const updated = await res.json() as Booking
      onUpdated?.(updated)
      setEdit(false)
    } catch (e: any) {
      alert(e.message || 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'reserved': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'checked_in': return 'bg-green-100 text-green-800 border-green-200'
      case 'checked_out': return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getChannelColor = (channel?: string) => {
    switch (channel) {
      case 'direct': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'booking.com': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'expedia': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  if (!booking) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl backdrop-blur bg-white/90 shadow-2xl border-0">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center justify-between">
            <span className="text-2xl font-semibold text-gray-900">Booking Details</span>
            <Badge className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(booking.status)}`}>
              {booking.status || 'Unknown'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-8 mt-2">
          {/* Left column */}
          <div className="space-y-6">
            {/* Reference Card */}
            <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Reference</h3>
              <p className="font-mono text-lg font-semibold text-gray-900">{booking.reference || booking.id}</p>
            </div>

            {/* Customer Card */}
            <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Customer</h3>
              <p className="font-semibold text-lg text-gray-900">{booking.customer_name || 'Unknown'}</p>
              {booking.customer_email && (
                <p className="text-sm text-gray-600 mt-1">{booking.customer_email}</p>
              )}
            </div>

            {/* Vehicle Card */}
            <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Vehicle</h3>
              <p className="font-semibold text-lg text-gray-900">{booking.plate || 'Not provided'}</p>
              <p className="text-sm text-gray-600 mt-1">
                {booking.car_make && booking.car_model 
                  ? `${booking.car_make} ${booking.car_model}`
                  : 'Make & Model: Not provided'
                }
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Color: {booking.car_color || 'Not provided'}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Flight: {booking.flight_number || 'Not provided'}
              </p>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Payment Card */}
            <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Payment</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Charged:</span>
                  <span className="font-semibold text-lg text-gray-900">
                    £{booking.money_charged?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Received:</span>
                  <span className="font-semibold text-lg text-gray-900">
                    £{booking.money_received?.toFixed(2) || '0.00'}
                  </span>
                </div>
              </div>
            </div>

            {/* Timing Card */}
            <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Timing</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-gray-600 text-sm">Start:</span>
                  <p className="font-medium text-gray-900">
                    {new Date(booking.start_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-gray-600 text-sm">End:</span>
                  <p className="font-medium text-gray-900">
                    {new Date(booking.end_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Channel Card */}
            <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 shadow-sm backdrop-blur-sm">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Channel</h3>
              <Badge className={`px-3 py-1 rounded-full text-sm font-medium border ${getChannelColor(booking.channel || booking.source)}`}>
                {booking.channel || booking.source || 'Direct'}
              </Badge>
            </div>
          </div>
        </div>

        <Separator className="my-8 bg-gray-200/50" />

        {/* Extension Panel */}
        {showExtendSheet && (tenantId || booking.tenant_id) && (
          <div className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 shadow-md backdrop-blur-sm">
            <h3 className="text-xl font-semibold mb-4 text-gray-900">Extend Booking</h3>
            <ExtendBookingSheet
              tenantId={tenantId || booking.tenant_id}
              booking={{
                id: booking.id,
                end_at: booking.end_at,
                flight_number: booking.flight_number,
                reference: booking.reference
              }}
              publishableKey={stripePublishableKey}
              onExtended={() => {
                setShowExtendSheet(false)
                onUpdated?.(booking)
              }}
              getQuote={async (newEndISO: string) => {
                const res = await fetch(`/api/pricing/quote-extension?tenantId=${tenantId || booking.tenant_id}&bookingEndAtISO=${booking.end_at}&newEndAtISO=${newEndISO}`)
                const data = await res.json()
                return data.ok ? data.quoteCents : 0
              }}
            />
          </div>
        )}

        {/* Action Bar */}
        <div className="mt-8 flex justify-end space-x-4">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="px-6 py-2 rounded-xl border-gray-300 hover:bg-gray-50"
          >
            Close
          </Button>
          <Button 
            variant="outline"
            onClick={() => setEdit(!edit)}
            className="px-6 py-2 rounded-xl border-gray-300 hover:bg-gray-50"
          >
            {edit ? 'Cancel' : 'Edit'}
          </Button>
          <Button 
            onClick={() => setShowExtendSheet(true)}
            disabled={busy}
            className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
          >
            Extend Booking
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
