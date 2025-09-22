import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { getServerSupabase } from '@/lib/supabase/server';

const COOKIE_NAME = 'booking_session';
const TTL_MINUTES = 30; // session for editing
const secret = new TextEncoder().encode(process.env.BOOKING_SESSION_SECRET || 'change-me-in-env');

function normalizeLastName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function POST(req: Request) {
  try {
    const { tenantSlug, lastName, reference } = await req.json();

    console.log('Manage booking login attempt:', { tenantSlug, lastName, reference });

    if (!tenantSlug || !lastName || !reference) {
      return NextResponse.json({ message: 'Missing fields.' }, { status: 400 });
    }

    const supabase = await getServerSupabase();

    // resolve tenant by slug
    const { data: tenant, error: terr } = await supabase
      .from('tenants')
      .select('id, slug')
      .eq('slug', tenantSlug)
      .maybeSingle();

    console.log('Tenant lookup result:', { tenant, error: terr });

    if (terr || !tenant) {
      return NextResponse.json({ message: 'Unknown site.' }, { status: 404 });
    }

    // bookings table must include: reference (text), customer_name (text), tenant_id
    const { data: booking, error: berr } = await supabase
      .from('bookings')
      .select('id, tenant_id, reference, customer_name, email, phone, vehicle_reg, car_make, car_model, car_color, flight_number, dropoff_time, pickup_time')
      .eq('tenant_id', tenant.id)
      .eq('reference', reference)
      .maybeSingle();

    console.log('Booking lookup result:', { booking, error: berr });

    if (berr || !booking) {
      return NextResponse.json({ message: 'Booking not found.' }, { status: 404 });
    }

    // simple name check: compare last token of customer_name with provided lastName
    const bookingLast = normalizeLastName(booking.customer_name.split(/\s+/).slice(-1)[0] || '');
    const providedLast = normalizeLastName(lastName);

    if (!bookingLast || bookingLast !== providedLast) {
      return NextResponse.json({ message: 'Name and reference do not match.' }, { status: 401 });
    }

    // issue short-lived booking session (cookie)
    const jwt = await new SignJWT({
      booking_id: booking.id,
      tenant_id: booking.tenant_id,
      reference: booking.reference,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(`${TTL_MINUTES}m`)
      .setIssuedAt()
      .sign(secret);

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, jwt, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: TTL_MINUTES * 60,
    });

    return NextResponse.json({ booking });
  } catch (e: any) {
    console.error('Manage booking login error:', e);
    return NextResponse.json({ message: e.message || 'Login failed.' }, { status: 500 });
  }
}
