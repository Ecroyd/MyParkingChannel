'use client';

import * as React from 'react';
import { toMoney } from '@/lib/money';
import { redirectToCheckout } from '@/lib/utils/redirect';

type Booking = {
  id: string;
  tenant_id: string;
  reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  plate: string;
  car_make: string | null;
  car_model: string | null;
  car_color: string | null;
  start_at: string;
  end_at: string;
  money_charged: number | null;
  money_received: number;
  notes: string | null;
  flight_number: string | null;
  stripe_payment_intent_id?: string | null;
  payment_status?: string | null;
};

interface NewBookingModalProps {
  tenantId: string;
  open: boolean;
  onClose: () => void;
  onBookingCreated?: (booking: Booking) => void;
}

export default function NewBookingModal({
  tenantId,
  open,
  onClose,
  onBookingCreated,
}: NewBookingModalProps) {
  const [tab, setTab] = React.useState<'create' | 'payment'>('create');
  const [loading, setLoading] = React.useState(false);
  const [createdBooking, setCreatedBooking] = React.useState<Booking | null>(null);
  const [error, setError] = React.useState<string>('');

  const handleBookingCreated = (booking: Booking) => {
    setCreatedBooking(booking);
    setTab('payment');
    if (onBookingCreated) {
      onBookingCreated(booking);
    }
  };

  const handleClose = () => {
    setCreatedBooking(null);
    setTab('create');
    setError('');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">
              {createdBooking ? `Booking ${createdBooking.reference}` : 'New Booking'}
            </h2>
          </div>
          <button className="text-sm hover:text-gray-600" onClick={handleClose}>
            Close
          </button>
        </div>

        <div className="px-4 pt-2 sticky top-[73px] bg-white border-b z-10">
          <div className="flex gap-3">
            {['create', 'payment'].map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (t === 'payment' && !createdBooking) {
                    setError('Please create the booking first');
                    return;
                  }
                  setTab(t as any);
                  setError('');
                }}
                className={`py-2 px-3 ${
                  tab === t
                    ? 'border-b-2 border-black font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                disabled={t === 'payment' && !createdBooking}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {tab === 'create' && (
            <CreateForm
              tenantId={tenantId}
              onCreated={handleBookingCreated}
              onError={setError}
              loading={loading}
              setLoading={setLoading}
            />
          )}

          {tab === 'payment' && createdBooking && (
            <PaymentForm
              booking={createdBooking}
              onPaymentSuccess={() => {
                handleClose();
                window.location.reload();
              }}
              onError={setError}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CreateForm({
  tenantId,
  onCreated,
  onError,
  loading,
  setLoading,
}: {
  tenantId: string;
  onCreated: (booking: Booking) => void;
  onError: (error: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const [form, setForm] = React.useState({
    reference: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    plate: '',
    car_make: '',
    car_model: '',
    car_color: '',
    flight_number: '',
    notes: '',
    start_at: '',
    end_at: '',
    money_charged: '',
    money_received: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    onError('');

    try {
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...form,
          money_charged: form.money_charged ? parseFloat(form.money_charged) : undefined,
          money_received: form.money_received ? parseFloat(form.money_received) : undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to create booking');
      }

      // Fetch the full booking details
      if (json.booking?.id) {
        const bookingRes = await fetch(`/api/bookings/${json.booking.id}`, {
          credentials: 'include',
        });
        const bookingData = await bookingRes.json();
        if (bookingData) {
          onCreated(bookingData);
        } else {
          onCreated(json.booking);
        }
      } else {
        onCreated(json.booking);
      }
    } catch (err: any) {
      onError(err.message || 'Failed to create booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Reference (optional)
          </label>
          <input
            type="text"
            className="w-full border rounded p-2"
            value={form.reference}
            onChange={(e) => setForm((prev) => ({ ...prev, reference: e.target.value }))}
            placeholder="Auto-generated if blank"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Customer Name *</label>
          <input
            type="text"
            className="w-full border rounded p-2"
            value={form.customer_name}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_name: e.target.value }))}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Email *</label>
          <input
            type="email"
            className="w-full border rounded p-2"
            value={form.customer_email}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_email: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Phone</label>
          <input
            type="tel"
            className="w-full border rounded p-2"
            value={form.customer_phone}
            onChange={(e) => setForm((prev) => ({ ...prev, customer_phone: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Vehicle Plate</label>
          <input
            type="text"
            className="w-full border rounded p-2"
            value={form.plate}
            onChange={(e) => setForm((prev) => ({ ...prev, plate: e.target.value }))}
            placeholder="ABC123"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Flight Number</label>
          <input
            type="text"
            className="w-full border rounded p-2"
            value={form.flight_number}
            onChange={(e) => setForm((prev) => ({ ...prev, flight_number: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Car Make</label>
          <input
            type="text"
            className="w-full border rounded p-2"
            value={form.car_make}
            onChange={(e) => setForm((prev) => ({ ...prev, car_make: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Car Model</label>
          <input
            type="text"
            className="w-full border rounded p-2"
            value={form.car_model}
            onChange={(e) => setForm((prev) => ({ ...prev, car_model: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Car Colour</label>
          <input
            type="text"
            className="w-full border rounded p-2"
            value={form.car_color}
            onChange={(e) => setForm((prev) => ({ ...prev, car_color: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start Date & Time *</label>
          <input
            type="datetime-local"
            className="w-full border rounded p-2"
            value={form.start_at}
            onChange={(e) => setForm((prev) => ({ ...prev, start_at: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End Date & Time *</label>
          <input
            type="datetime-local"
            className="w-full border rounded p-2"
            value={form.end_at}
            onChange={(e) => setForm((prev) => ({ ...prev, end_at: e.target.value }))}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Amount Charged (£)</label>
          <input
            type="number"
            step="0.01"
            className="w-full border rounded p-2"
            value={form.money_charged}
            onChange={(e) => setForm((prev) => ({ ...prev, money_charged: e.target.value }))}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Amount Received (£)</label>
          <input
            type="number"
            step="0.01"
            className="w-full border rounded p-2"
            value={form.money_received}
            onChange={(e) => setForm((prev) => ({ ...prev, money_received: e.target.value }))}
            placeholder="0.00"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Notes</label>
        <textarea
          className="w-full border rounded p-2"
          rows={3}
          value={form.notes}
          onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => {}}
          className="px-4 py-2 rounded border hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Booking'}
        </button>
      </div>
    </form>
  );
}

function PaymentForm({
  booking,
  onPaymentSuccess,
  onError,
}: {
  booking: Booking;
  onPaymentSuccess: () => void;
  onError: (error: string) => void;
}) {
  const [processing, setProcessing] = React.useState(false);

  const handleTakePayment = async () => {
    setProcessing(true);
    onError('');

    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          booking_id: booking.id,
          application_fee_cents: 0, // Adjust as needed
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to create payment session');
      }

      if (json.url) {
        redirectToCheckout(json.url);
      } else {
        throw new Error('No payment URL returned');
      }
    } catch (err: any) {
      onError(err.message || 'Failed to create payment session');
      setProcessing(false);
    }
  };

  const chargedAmount = booking.money_charged || 0;
  const receivedAmount = booking.money_received || 0;
  const outstandingAmount = chargedAmount - receivedAmount;

  return (
    <div className="grid gap-4">
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-medium mb-3">Booking Summary</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Reference:</span>
            <span className="ml-2 font-medium">{booking.reference}</span>
          </div>
          <div>
            <span className="text-gray-500">Customer:</span>
            <span className="ml-2 font-medium">{booking.customer_name}</span>
          </div>
          <div>
            <span className="text-gray-500">Amount Charged:</span>
            <span className="ml-2 font-medium">{toMoney(Math.round(chargedAmount * 100))}</span>
          </div>
          <div>
            <span className="text-gray-500">Amount Received:</span>
            <span className="ml-2 font-medium">{toMoney(Math.round(receivedAmount * 100))}</span>
          </div>
          {outstandingAmount > 0 && (
            <div className="col-span-2 pt-2 border-t">
              <span className="text-gray-500">Outstanding:</span>
              <span className="ml-2 font-medium text-red-600">
                {toMoney(Math.round(outstandingAmount * 100))}
              </span>
            </div>
          )}
        </div>
      </div>

      {booking.stripe_payment_intent_id ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded">
          <p className="text-sm text-green-700">
            ✓ Payment already processed (ID: {booking.stripe_payment_intent_id})
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            {outstandingAmount > 0 ? (
              <>
                Take payment for the outstanding amount of{' '}
                <span className="font-semibold">
                  {toMoney(Math.round(outstandingAmount * 100))}
                </span>
                . The amount will be calculated automatically based on the booking dates.
              </>
            ) : (
              <>
                Create a Stripe checkout session to collect payment for this booking. The amount
                will be calculated automatically based on the booking dates (
                {new Date(booking.start_at).toLocaleDateString()} -{' '}
                {new Date(booking.end_at).toLocaleDateString()}).
              </>
            )}
          </p>
          <button
            onClick={handleTakePayment}
            disabled={processing}
            className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {processing ? 'Creating checkout session...' : 'Take Payment via Stripe'}
          </button>
        </div>
      )}
    </div>
  );
}

