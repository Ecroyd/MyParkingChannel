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
  source: 'direct' | 'manual' | 'parkvia' | 'holidayextras' | 'other';
  status?: string;
};

// datetime-local values on this page are rendered from (and read back as) UTC ISO strings.
function toInputValue(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(0, 16) : '';
}
function fromInputValue(value: string): string {
  return new Date(`${value}:00Z`).toISOString();
}

export default function ManageBookingPage() {
  const params = useParams();
  const tenantSlug = params.slug as string;
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  const [step, setStep] = useState<'login' | 'edit' | 'extend' | 'cancel'>('login');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [extendEndDate, setExtendEndDate] = useState('');

  // login fields
  const [lookupMethod, setLookupMethod] = useState<'reference' | 'plate'>('reference');
  const [lastName, setLastName] = useState('');
  const [bookingRef, setBookingRef] = useState('');
  const [registrationPlate, setRegistrationPlate] = useState('');

  // booking model
  const [booking, setBooking] = useState<Booking | null>(null);
  const [form, setForm] = useState({
    plate: '',
    car_make: '',
    car_model: '',
    car_color: '',
    customer_email: '',
    flight_number: '',
    start_at: '',
    end_at: '',
  });

  // Returning from Stripe Checkout for a paid extension (the webhook applies it once paid).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('extended') === '1') {
      setSuccess(
        'Thank you - your payment has been received. Your extension is confirmed as soon as the payment completes (usually within a minute). Find your booking again below to see your new pick-up time.'
      );
    } else if (qs.get('extend_cancelled') === '1') {
      setErr('Payment was cancelled, so your booking has not been extended.');
    }
  }, []);

  // Determine if booking is direct/manual (full features) or channel (limited)
  const isDirectBooking = booking ? (booking.source === 'direct' || booking.source === 'manual') : false;


  function onChange(name: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSuccess(null);
    setLoading(true);

    try {
      const body: any = {
        tenantSlug,
        lookupMethod,
      };

      if (lookupMethod === 'reference') {
        if (!bookingRef.trim()) {
          setErr('Please enter your booking reference');
          setLoading(false);
          return;
        }
        body.reference = bookingRef.trim();
        body.lastName = lastName.trim();
      } else {
        if (!registrationPlate.trim()) {
          setErr('Please enter your registration plate');
          setLoading(false);
          return;
        }
        body.plate = registrationPlate.trim().toUpperCase().replace(/\s+/g, '');
        if (!lastName.trim()) {
          setErr('Please enter your last name');
          setLoading(false);
          return;
        }
        body.lastName = lastName.trim();
      }

      const res = await fetch('/api/manage-booking/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
        start_at: data.booking.start_at ? new Date(data.booking.start_at).toISOString().slice(0, 16) : '',
        end_at: data.booking.end_at ? new Date(data.booking.end_at).toISOString().slice(0, 16) : '',
      });
      setExtendEndDate(data.booking.end_at ? new Date(data.booking.end_at).toISOString().slice(0, 16) : '');
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
      const changes: any = {
        plate: form.plate.trim() || null,
        car_make: form.car_make.trim() || null,
        car_model: form.car_model.trim() || null,
        car_color: form.car_color.trim() || null,
        customer_email: form.customer_email.trim() || null,
        flight_number: form.flight_number.trim() || null,
      };

      // Only allow date changes for direct/manual bookings, and only send them when edited.
      // The inputs are filled from UTC ISO strings, so read them back as UTC.
      if (isDirectBooking) {
        if (form.start_at && form.start_at !== toInputValue(booking.start_at)) {
          changes.start_at = fromInputValue(form.start_at);
        }
        if (form.end_at && form.end_at !== toInputValue(booking.end_at)) {
          changes.end_at = fromInputValue(form.end_at);
        }
      }

      const res = await fetch('/api/manage-booking/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.dateChangeRefused) {
          // Put the date inputs back to the booking's current dates.
          setForm((prev) => ({
            ...prev,
            start_at: toInputValue(booking.start_at),
            end_at: toInputValue(booking.end_at),
          }));
        }
        throw new Error(data?.message || 'Unable to save changes.');
      }

      const data = (await res.json()) as { booking?: Booking; ok?: boolean };
      setSuccess('Booking updated successfully! ✅');
      
      // Refresh booking data if provided
      if (data.booking) {
        setBooking(data.booking);
      } else {
        // Reload booking from API if not provided in response
        const loginRes = await fetch('/api/manage-booking/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantSlug,
            lookupMethod: booking?.reference ? 'reference' : 'plate',
            ...(booking?.reference ? { reference: booking.reference } : { plate: booking?.plate }),
            lastName: lastName || '',
          }),
        });
        if (loginRes.ok) {
          const loginData = (await loginRes.json()) as { booking: Booking };
          setBooking(loginData.booking);
        }
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExtend(e: React.FormEvent) {
    e.preventDefault();
    if (!booking) return;
    setErr(null);
    setSuccess(null);
    setLoading(true);

    try {
      const newEndAt = fromInputValue(extendEndDate);

      const res = await fetch('/api/manage-booking/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newEndAt,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Unable to extend booking.');
      }

      const data = (await res.json()) as { booking?: Booking; checkoutUrl?: string };

      // Extra nights cost more: pay on Stripe first; the booking is updated once payment completes.
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (!data.booking) throw new Error('Unable to extend booking.');
      const extended = data.booking;

      setBooking(extended);
      setExtendEndDate(extended.end_at ? new Date(extended.end_at).toISOString().slice(0, 16) : '');
      setForm(prev => ({
        ...prev,
        end_at: extended.end_at ? new Date(extended.end_at).toISOString().slice(0, 16) : '',
      }));
      setStep('edit');
      setSuccess('Booking extended successfully! ✅');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!booking) return;
    if (!confirm('Are you sure you want to cancel this booking? This action cannot be undone.')) {
      return;
    }

    setErr(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await fetch('/api/manage-booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Unable to cancel booking.');
      }

      const data = (await res.json()) as { booking: Booking };
      setBooking(data.booking);
      setStep('edit');
      setSuccess('Booking cancelled successfully.');
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
                  <Label>Lookup method</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="lookupMethod"
                        value="reference"
                        checked={lookupMethod === 'reference'}
                        onChange={() => {
                          setLookupMethod('reference');
                          setErr(null);
                        }}
                        disabled={disabled}
                      />
                      <span>By Reference</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="lookupMethod"
                        value="plate"
                        checked={lookupMethod === 'plate'}
                        onChange={() => {
                          setLookupMethod('plate');
                          setErr(null);
                        }}
                        disabled={disabled}
                      />
                      <span>By Registration Plate</span>
                    </label>
                  </div>
                </div>

                {lookupMethod === 'reference' ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="registrationPlate">Registration plate</Label>
                      <Input
                        id="registrationPlate"
                        value={registrationPlate}
                        onChange={(e) => setRegistrationPlate(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                        placeholder="e.g. AB12CDE"
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
                  </>
                )}

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
          <>
            <Card className="shadow-soft">
              <CardHeader>
                <CardTitle>Update your booking</CardTitle>
                <p className="text-sm text-slate-600">
                  Reference: <span className="font-mono font-medium">{booking.reference}</span>
                  {!isDirectBooking && (
                    <span className="ml-2 text-xs text-amber-600">
                      (Booked via {booking.source === 'parkvia' ? 'ParkVia' : booking.source === 'holidayextras' ? 'Holiday Extras' : 'external channel'})
                    </span>
                  )}
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
                    {isDirectBooking && (
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
                    )}
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
                    {isDirectBooking && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="start_at">Drop-off date & time</Label>
                          <Input
                            id="start_at"
                            type="datetime-local"
                            value={form.start_at}
                            onChange={(e) => onChange('start_at', e.target.value)}
                            disabled={disabled}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="end_at">Pick-up date & time</Label>
                          <Input
                            id="end_at"
                            type="datetime-local"
                            value={form.end_at}
                            onChange={(e) => onChange('end_at', e.target.value)}
                            disabled={disabled}
                          />
                        </div>
                      </>
                    )}
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
                    {isDirectBooking && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleCancel}
                        disabled={disabled || booking.status === 'cancelled'}
                      >
                        Cancel booking
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep('extend')}
                      disabled={disabled}
                    >
                      Extend booking
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setStep('login');
                        setErr(null);
                        setSuccess(null);
                        setBookingRef('');
                        setRegistrationPlate('');
                        setLastName('');
                      }}
                      disabled={disabled}
                    >
                      Not your booking?
                    </Button>
                  </div>

                  {!isDirectBooking && (
                    <Alert className="border-amber-200 bg-amber-50">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-700">
                        This booking was made through an external channel. You can update vehicle details and extend your stay, but cancellations must be made through the original booking channel.
                      </AlertDescription>
                    </Alert>
                  )}

                  {isDirectBooking && (
                    <p className="text-xs text-slate-500">
                      You can update all details, extend, or cancel your booking here.
                    </p>
                  )}
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {step === 'extend' && booking && (
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Extend your booking</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleExtend} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="extend_end_at">New pick-up date & time</Label>
                  <Input
                    id="extend_end_at"
                    type="datetime-local"
                    value={extendEndDate}
                    onChange={(e) => setExtendEndDate(e.target.value)}
                    min={booking.end_at ? new Date(booking.end_at).toISOString().slice(0, 16) : undefined}
                    disabled={disabled}
                    required
                  />
                  <p className="text-xs text-slate-500">
                    If the extra time costs more, you&apos;ll be taken to secure payment and your booking is
                    extended once payment completes.
                  </p>
                  <p className="text-xs text-slate-500">
                    Current pick-up: {new Date(booking.end_at).toLocaleString('en-GB', { 
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    disabled={disabled}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Extending...
                      </>
                    ) : (
                      'Extend booking'
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep('edit')}
                    disabled={disabled}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
      <Footer title="Manage Booking" />
    </>
  );
}
