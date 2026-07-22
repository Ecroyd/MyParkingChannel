// app/success/page.tsx
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import BackButton from '@/components/success/BackButton';
import BookingProcessor from '@/components/success/BookingProcessor';
import PollForSession from '@/components/success/PollForSession';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Booking confirmation',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

async function getBookingByCheckoutSessionId(sessionId: string) {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from('bookings')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();
  return booking ?? null;
}

async function getBookingDetails(tenantId: string, reference?: string) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  let query = supabase
    .from('bookings')
    .select('*')
    .eq('tenant_id', tenantId);

  // If we have a reference, use it to find the specific booking
  if (reference) {
    query = query.eq('reference', reference);
  } else {
    // Fallback to most recent booking
    query = query.order('created_at', { ascending: false }).limit(1);
  }

  const { data: bookings, error } = await query;

  if (error || !bookings || bookings.length === 0) {
    return null;
  }

  return bookings[0];
}

async function getTenantDetails(tenantId: string) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('name, slug')
    .eq('id', tenantId)
    .single();

  if (error || !tenant) {
    return null;
  }

  return tenant;
}

async function SuccessContent({ searchParams }: { searchParams: Promise<{ session_id?: string; tenant?: string; reference?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const sessionId = resolvedSearchParams.session_id;
  const tenantId = resolvedSearchParams.tenant;
  const reference = resolvedSearchParams.reference;

  // Prefer session_id (no tenant/reference in URL); webhook sets stripe_checkout_session_id on booking
  if (sessionId && sessionId.startsWith('cs_')) {
    const booking = await getBookingByCheckoutSessionId(sessionId);
    if (booking) {
      const tenant = await getTenantDetails(booking.tenant_id);
      return (
        <SuccessView
          booking={booking}
          tenantId={booking.tenant_id}
          tenant={tenant}
        />
      );
    }
    return <PollForSession sessionId={sessionId} />;
  }

  if (!tenantId) {
    redirect('/');
  }

  const [booking, tenant] = await Promise.all([
    getBookingDetails(tenantId, reference),
    getTenantDetails(tenantId)
  ]);

  if (!booking) {
    return <BookingProcessor tenantId={tenantId} reference={reference || ''} />;
  }

  return (
    <SuccessView
      booking={booking}
      tenantId={tenantId}
      tenant={tenant}
    />
  );
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function SuccessView({
  booking,
  tenantId,
  tenant,
}: {
  booking: { reference: string; customer_name: string; customer_email: string; plate: string; start_at: string; end_at: string; money_charged: number | null; status: string };
  tenantId: string;
  tenant: { name?: string; slug?: string } | null;
}) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
        <p className="text-lg text-gray-600">Your parking booking has been confirmed</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Booking Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Booking Reference</p>
            <p className="font-semibold text-lg">{booking.reference}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Customer Name</p>
            <p className="font-semibold">{booking.customer_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Vehicle Registration</p>
            <p className="font-semibold">{booking.plate}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p className="font-semibold">{booking.customer_email}</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Parking Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Arrival Date & Time</p>
            <p className="font-semibold">{formatDate(booking.start_at)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Departure Date & Time</p>
            <p className="font-semibold">{formatDate(booking.end_at)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Amount</p>
            <p className="font-semibold text-lg">£{(booking.money_charged ?? 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              {booking.status}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">What's Next?</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• You'll receive a confirmation email shortly</li>
          <li>• Please arrive at the car park at your scheduled time</li>
          <li>• Keep your booking reference handy: <strong>{booking.reference}</strong></li>
          <li>• Contact {tenant?.name || 'the car park'} if you have any questions</li>
        </ul>
      </div>

      <BackButton tenantId={tenantId} tenantName={tenant?.name} tenantSlug={tenant?.slug} />
    </main>
  );
}

export default function Success({ searchParams }: { searchParams: Promise<{ session_id?: string; tenant?: string; reference?: string }> }) {
  return (
    <Suspense fallback={
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-2xl font-semibold mb-2">Loading...</h1>
        <p className="text-sm">Please wait while we fetch your booking details.</p>
      </main>
    }>
      <SuccessContent searchParams={searchParams} />
    </Suspense>
  );
}
