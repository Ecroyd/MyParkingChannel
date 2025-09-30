'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
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
  customer_email: string | null;
  plate: string | null;
  car_make: string | null;
  car_model: string | null;
  car_color: string | null;
  flight_number: string | null;
  start_at: string;
  end_at: string;
};

export default function ManageBookingPage() {
  const params = useParams();
  const tenantSlug = params.slug as string;
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const [step, setStep] = useState<'login' | 'edit'>('login');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // login fields
  const [lastName, setLastName] = useState('');
  const [bookingRef, setBookingRef] = useState('');

  // booking model
  const [booking, setBooking] = useState<Booking | null>(null);
  const [form, setForm] = useState({
    plate: '',
    car_make: '',
    car_model: '',
    car_color: '',
    customer_email: '',
    flight_number: '',
  });


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
        plate: data.booking.plate || '',
        car_make: data.booking.car_make || '',
        car_model: data.booking.car_model || '',
        car_color: data.booking.car_color || '',
        customer_email: data.booking.customer_email || '',
        flight_number: data.booking.flight_number || '',
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
            plate: form.plate.trim() || null,
            car_make: form.car_make.trim() || null,
            car_model: form.car_model.trim() || null,
            car_color: form.car_color.trim() || null,
            customer_email: form.customer_email.trim() || null,
            flight_number: form.flight_number.trim() || null,
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
      <Header title="Manage Booking" tenantSlug={tenantSlug} />
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
                    <Label htmlFor="plate">Vehicle registration</Label>
                    <Input
                      id="plate"
                      value={form.plate}
                      onChange={(e) => onChange('plate', e.target.value.toUpperCase())}
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
                    <Label htmlFor="customer_email">Contact email</Label>
                    <Input
                      id="customer_email"
                      type="email"
                      value={form.customer_email}
                      onChange={(e) => onChange('customer_email', e.target.value)}
                      placeholder="your@email.com"
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
