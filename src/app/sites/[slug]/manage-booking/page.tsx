'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Header, Footer } from '../_components/SiteChrome';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

type Booking = {
  id: string;
  tenant_id: string;
  reference: string;
  customer_name: string;
  email: string | null;
  phone: string | null;
  vehicle_reg: string | null;
  car_make: string | null;
  car_model: string | null;
  car_color: string | null;
  flight_number: string | null;
  // times only — not dates
  dropoff_time: string | null;    // e.g. "10:30"
  pickup_time: string | null;     // e.g. "18:45"
};

export default function ManageBookingPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const [step, setStep] = useState<'login' | 'edit'>('login');
  const [tenantSlug, setTenantSlug] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // login fields
  const [lastName, setLastName] = useState('');
  const [bookingRef, setBookingRef] = useState('');

  // booking model
  const [booking, setBooking] = useState<Booking | null>(null);
  const [form, setForm] = useState({
    vehicle_reg: '',
    car_make: '',
    car_model: '',
    car_color: '',
    phone: '',
    flight_number: '',
    dropoff_time: '',
    pickup_time: '',
  });

  useEffect(() => {
    // derive tenant slug from /sites/[slug]/...
    const parts = window.location.pathname.split('/').filter(Boolean);
    const slugIdx = parts.indexOf('sites') + 1;
    const slug = parts[slugIdx] || '';
    console.log('Extracted tenant slug:', { parts, slugIdx, slug });
    setTenantSlug(slug);
  }, []);

  function onChange(name: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch('/api/manage-booking/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          lastName: lastName.trim(),
          reference: bookingRef.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Could not find that booking.');
      }

      const data = (await res.json()) as { booking: Booking };
      setBooking(data.booking);
      setForm({
        vehicle_reg: data.booking.vehicle_reg ?? '',
        car_make: data.booking.car_make ?? '',
        car_model: data.booking.car_model ?? '',
        car_color: data.booking.car_color ?? '',
        phone: data.booking.phone ?? '',
        flight_number: data.booking.flight_number ?? '',
        dropoff_time: data.booking.dropoff_time ?? '',
        pickup_time: data.booking.pickup_time ?? '',
      });
      setStep('edit');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!booking) return;
    setErr(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch('/api/manage-booking/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // booking is inferred from secure cookie set at login
          changes: {
            vehicle_reg: form.vehicle_reg.trim() || null,
            car_make: form.car_make.trim() || null,
            car_model: form.car_model.trim() || null,
            car_color: form.car_color.trim() || null,
            phone: form.phone.trim() || null,
            flight_number: form.flight_number.trim() || null,
            dropoff_time: form.dropoff_time.trim() || null,
            pickup_time: form.pickup_time.trim() || null,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Unable to save changes.');
      }

      setSuccess('Booking updated successfully! ✅');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading;

  return (
    <>
      <Header title="Manage Booking" />
      <main className="max-w-2xl mx-auto px-4 pt-14 pb-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 mb-4">Manage your booking</h1>
          <p className="text-slate-600">
            Update your vehicle details, contact information, and preferred times.
          </p>
        </div>

        {err && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">{err}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">{success}</AlertDescription>
          </Alert>
        )}

        {step === 'login' && (
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Find your booking</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bookingRef">Booking reference</Label>
                  <Input
                    id="bookingRef"
                    value={bookingRef}
                    onChange={(e) => setBookingRef(e.target.value)}
                    placeholder="e.g. FPX-12345"
                    required
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Smith"
                    required
                    disabled={disabled}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={disabled}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    'Find booking'
                  )}
                </Button>
                <p className="text-xs text-slate-500 text-center">
                  You'll be able to edit your vehicle and contact details, plus drop-off / pick-up times.
                </p>
              </form>
            </CardContent>
          </Card>
        )}

        {step === 'edit' && booking && (
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Update your booking</CardTitle>
              <p className="text-sm text-slate-600">
                Reference: <span className="font-mono font-medium">{booking.reference}</span>
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vehicle_reg">Vehicle registration</Label>
                    <Input
                      id="vehicle_reg"
                      value={form.vehicle_reg}
                      onChange={(e) => onChange('vehicle_reg', e.target.value.toUpperCase())}
                      placeholder="AB12 CDE"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="car_make">Make</Label>
                    <Input
                      id="car_make"
                      value={form.car_make}
                      onChange={(e) => onChange('car_make', e.target.value)}
                      placeholder="Audi"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="car_model">Model</Label>
                    <Input
                      id="car_model"
                      value={form.car_model}
                      onChange={(e) => onChange('car_model', e.target.value)}
                      placeholder="Q5"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="car_color">Colour</Label>
                    <Input
                      id="car_color"
                      value={form.car_color}
                      onChange={(e) => onChange('car_color', e.target.value)}
                      placeholder="Grey"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Contact phone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => onChange('phone', e.target.value)}
                      placeholder="+44..."
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="flight_number">Flight number (optional)</Label>
                    <Input
                      id="flight_number"
                      value={form.flight_number}
                      onChange={(e) => onChange('flight_number', e.target.value.toUpperCase())}
                      placeholder="BA1432"
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dropoff_time">Drop-off time</Label>
                    <Input
                      id="dropoff_time"
                      type="time"
                      value={form.dropoff_time || ''}
                      onChange={(e) => onChange('dropoff_time', e.target.value)}
                      disabled={disabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pickup_time">Pick-up time</Label>
                    <Input
                      id="pickup_time"
                      type="time"
                      value={form.pickup_time || ''}
                      onChange={(e) => onChange('pickup_time', e.target.value)}
                      disabled={disabled}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={disabled}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save changes'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStep('login');
                      setErr(null);
                      setSuccess(null);
                    }}
                    disabled={disabled}
                  >
                    Not your booking?
                  </Button>
                </div>

                <p className="text-xs text-slate-500">
                  You can't change dates or cancel here. Contact support if you need to amend dates.
                </p>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
      <Footer title="Manage Booking" />
    </>
  );
}
