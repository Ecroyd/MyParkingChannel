// GET /api/bookings/by-checkout-session?session_id=cs_xxx
// Look up booking by Stripe Checkout Session ID (set by webhook). Used by the success page
// so we don't rely on tenant/reference in the URL.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: 'Missing or invalid session_id' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .select('*')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();

  if (bookingError) {
    console.error('by-checkout-session booking lookup error:', bookingError);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const { data: tenant, error: tenantError } = await admin
    .from('tenants')
    .select('id, name, slug')
    .eq('id', booking.tenant_id)
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json({ booking, tenant: null });
  }

  return NextResponse.json({ booking, tenant });
}
