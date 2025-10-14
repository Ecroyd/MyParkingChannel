'use client';

import * as React from 'react';
import { createClient } from '@supabase/supabase-js';
import { toMoney } from '@/lib/money';

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
  notes: string | null;
  flight_number: string | null;
  is_incomplete?: boolean;
  missing_fields?: string[];
  stripe_payment_intent_id?: string | null;
  payment_status?: string | null;
  money_received?: boolean;
};

export default function BookingDetailsModal({
  booking,
  open,
  onClose,
  onBookingUpdated,
}: {
  booking: Booking | null;
  open: boolean;
  onClose: () => void;
  onBookingUpdated?: () => void;
}) {
  const [tab, setTab] = React.useState<'overview'|'edit'|'extend'|'refund'>('overview');
  const [loading, setLoading] = React.useState(false);

  const refresh = async () => {
    if (onBookingUpdated) {
      onBookingUpdated();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Booking {booking?.reference}</h2>
            {booking?.is_incomplete && (
              <span className="inline-flex px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                Incomplete ({booking.missing_fields?.join(', ')})
              </span>
            )}
          </div>
          <button className="text-sm" onClick={onClose}>Close</button>
        </div>

        <div className="px-4 pt-2">
          <div className="flex gap-3 border-b">
            {['overview','edit','extend','refund'].map(t => (
              <button
                key={t}
                onClick={() => setTab(t as any)}
                className={`py-2 ${tab===t ? 'border-b-2 border-black font-medium' : 'text-gray-500'}`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {loading && <p>Loading…</p>}

              {!loading && booking && tab === 'overview' && (
                <div className="grid grid-cols-2 gap-4">
                  <Info label="Customer" value={booking.customer_name} />
                  <Info label="Email" value={booking.customer_email} />
                  <Info label="Phone" value={booking.customer_phone || '—'} />
                  <Info label="Plate" value={booking.plate} />
                  <Info label="Make" value={booking.car_make || '—'} />
                  <Info label="Model" value={booking.car_model || '—'} />
                  <Info label="Colour" value={booking.car_color || '—'} />
                  <Info label="Start" value={new Date(booking.start_at).toLocaleString()} />
                  <Info label="End" value={new Date(booking.end_at).toLocaleString()} />
                  <Info label="Charged" value={toMoney(Math.round((booking.money_charged ?? 0) * 100))} />
                  <Info label="Flight" value={booking.flight_number || '—'} />
                  <div className="col-span-2">
                    <Info label="Notes" value={booking.notes || '—'} />
                  </div>
                </div>
              )}

          {!loading && booking && tab === 'edit' && (
            <EditForm booking={booking} onSaved={async () => { await refresh(); setTab('overview'); }} />
          )}

          {!loading && booking && tab === 'extend' && (
            <ExtendForm booking={booking} onExtended={async () => { await refresh(); setTab('overview'); }} />
          )}

          {!loading && booking && tab === 'refund' && (
            <RefundForm booking={booking} onRefunded={async () => { await refresh(); setTab('overview'); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function EditForm({ booking, onSaved }: { booking: any; onSaved: () => void }) {
  const [form, setForm] = React.useState({
    customer_email: booking.customer_email || '',
    customer_phone: booking.customer_phone || '',
    plate: booking.plate || '',
    car_make: booking.car_make || '',
    car_model: booking.car_model || '',
    car_color: booking.car_color || '',
    flight_number: booking.flight_number || '',
    notes: booking.notes || '',
    start_at: booking.start_at ? new Date(booking.start_at).toISOString().slice(0, 16) : '',
    end_at: booking.end_at ? new Date(booking.end_at).toISOString().slice(0, 16) : '',
  });
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      alert(json?.error || 'Update failed'); // or toast.error(...)
      return;
    }

    onSaved();
  };

  return (
    <div className="grid gap-3">
      {/* Date fields */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Start Date & Time</label>
          <input
            type="datetime-local"
            className="w-full border rounded p-2"
            value={form.start_at}
            onChange={e=>setForm(prev=>({ ...prev, start_at: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">End Date & Time</label>
          <input
            type="datetime-local"
            className="w-full border rounded p-2"
            value={form.end_at}
            onChange={e=>setForm(prev=>({ ...prev, end_at: e.target.value }))}
          />
        </div>
      </div>
      
      {['customer_email','customer_phone','plate','car_make','car_model','car_color','flight_number'].map((k) => (
        <div key={k}>
          <label className="block text-xs text-gray-500 mb-1">{k.replace('_',' ')}</label>
          <input
            className="w-full border rounded p-2"
            value={(form as any)[k]}
            onChange={e=>setForm(prev=>({ ...prev, [k]: e.target.value }))}
          />
        </div>
      ))}
      <div>
        <label className="block text-xs text-gray-500 mb-1">notes</label>
        <textarea className="w-full border rounded p-2" value={form.notes}
          onChange={e=>setForm(prev=>({ ...prev, notes: e.target.value }))} />
      </div>
      <button onClick={save} disabled={saving} className="px-4 py-2 rounded bg-black text-white w-fit">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}

function ExtendForm({ booking, onExtended }: { booking: any; onExtended: () => void }) {
  const [newEndAt, setNewEndAt] = React.useState<string>('');
  const [note, setNote] = React.useState<string>('');
  const [manual, setManual] = React.useState<boolean>(false);
  const [manualAmountCents, setManualAmountCents] = React.useState<number>(0);
  const [quoting, setQuoting] = React.useState(false);
  const [quoteCents, setQuoteCents] = React.useState<number>(0);
  const [pk, setPk] = React.useState<string>('');
  const [clientSecret, setClientSecret] = React.useState<string>('');
  const [amountCents, setAmountCents] = React.useState<number>(0);
  const [confirming, setConfirming] = React.useState(false);

  const calcQuote = async () => {
    if (!newEndAt) return;
    setQuoting(true);
    const res = await fetch('/api/bookings/quote', {
      method: 'POST',
      body: JSON.stringify({ tenantId: booking.tenant_id, prevEndAt: booking.end_at, newEndAt }),
    });
    const json = await res.json();
    setQuoteCents(json.amountCents || 0);
    setQuoting(false);
  };

  const createIntent = async () => {
    const res = await fetch('/api/stripe/extensions/create-intent', {
      method: 'POST',
      body: JSON.stringify({
        bookingId: booking.id,
        tenantId: booking.tenant_id,
        prevEndAt: booking.end_at,
        newEndAt,
        note,
        manualAmountCents: manual ? manualAmountCents : undefined,
      }),
    });
    const json = await res.json();
    if (json.clientSecret) {
      setPk(json.publishableKey);
      setClientSecret(json.clientSecret);
      setAmountCents(json.amountCents);
    }
  };

  const confirm = async () => {
    if (!clientSecret || !pk) return;
    setConfirming(true);
    // Lazy load Stripe.js only now
    const { loadStripe } = await import('@stripe/stripe-js');
    const stripe = await loadStripe(pk);
    const { error } = await stripe!.confirmCardPayment(clientSecret);
    setConfirming(false);
    if (!error) onExtended();
  };

  return (
    <div className="grid gap-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">New end date/time</label>
        <input type="datetime-local" className="border rounded p-2"
               value={newEndAt}
               onChange={e=>setNewEndAt(e.target.value)} />
        <button className="ml-2 text-sm underline" onClick={calcQuote} disabled={!newEndAt || quoting}>
          {quoting ? 'Quoting…' : 'Get auto-quote'}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input id="manual" type="checkbox" checked={manual} onChange={e=>setManual(e.target.checked)} />
        <label htmlFor="manual">Manual price override</label>
      </div>

      {manual ? (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Amount (pence)</label>
          <input type="number" className="border rounded p-2"
                 value={manualAmountCents}
                 onChange={e=>setManualAmountCents(parseInt(e.target.value||'0',10))}/>
        </div>
      ) : (
        <div className="text-sm text-gray-700">Auto quote: <b>{toMoney(quoteCents)}</b></div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">Note (optional)</label>
        <input className="border rounded p-2 w-full" value={note} onChange={e=>setNote(e.target.value)} />
      </div>

      {!clientSecret ? (
        <button
          className="px-4 py-2 rounded bg-black text-white w-fit"
          onClick={createIntent}
          disabled={!newEndAt}
        >
          Create payment & record extension
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <div>To charge: <b>{toMoney(amountCents)}</b></div>
          <button
            className="px-4 py-2 rounded bg-black text-white"
            onClick={confirm}
            disabled={confirming}
          >
            {confirming ? 'Confirming…' : 'Confirm Payment'}
          </button>
        </div>
      )}
    </div>
  );
}

function RefundForm({ booking, onRefunded }: { booking: any; onRefunded: () => void }) {
  const [refundAmount, setRefundAmount] = React.useState<number>(0);
  const [reason, setReason] = React.useState<string>('');
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string>('');

  // Set default refund amount to the charged amount
  React.useEffect(() => {
    if (booking.money_charged && refundAmount === 0) {
      setRefundAmount(Math.round(booking.money_charged * 100)); // Convert to cents
    }
  }, [booking.money_charged, refundAmount]);

  const processRefund = async () => {
    if (!booking.stripe_payment_intent_id) {
      setError('No payment intent found for this booking');
      return;
    }

    if (refundAmount <= 0) {
      setError('Refund amount must be greater than 0');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const res = await fetch('/api/bookings/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          tenantId: booking.tenant_id,
          paymentIntentId: booking.stripe_payment_intent_id,
          amount: refundAmount,
          reason: reason || 'requested_by_customer'
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Refund failed');
      }

      onRefunded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Refund Amount (pence)</label>
        <input 
          type="number" 
          className="border rounded p-2 w-full"
          value={refundAmount}
          onChange={e => setRefundAmount(parseInt(e.target.value || '0', 10))}
          min="1"
          max={Math.round((booking.money_charged || 0) * 100)}
        />
        <div className="text-xs text-gray-500 mt-1">
          Original charge: {toMoney(Math.round((booking.money_charged || 0) * 100))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Reason (optional)</label>
        <select 
          className="border rounded p-2 w-full"
          value={reason}
          onChange={e => setReason(e.target.value)}
        >
          <option value="">Select a reason</option>
          <option value="requested_by_customer">Requested by customer</option>
          <option value="duplicate">Duplicate payment</option>
          <option value="fraudulent">Fraudulent</option>
          <option value="other">Other</option>
        </select>
      </div>

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button
          className="px-4 py-2 rounded bg-red-600 text-white"
          onClick={processRefund}
          disabled={processing || !booking.stripe_payment_intent_id}
        >
          {processing ? 'Processing Refund...' : 'Process Refund'}
        </button>
        
        {!booking.stripe_payment_intent_id && (
          <span className="text-sm text-gray-500">No payment found for this booking</span>
        )}
      </div>
    </div>
  );
}
