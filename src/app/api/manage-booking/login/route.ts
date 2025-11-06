import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { getServerSupabase } from '@/lib/supabase/server';
import { createServerClientDirect } from '@/lib/supabase/server-direct';

const COOKIE_NAME = 'booking_session';
const TTL_MINUTES = 30; // session for editing
const secret = new TextEncoder().encode(process.env.BOOKING_SESSION_SECRET || 'change-me-in-env');

function normalizeLastName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function POST(req: Request) {
  try {
    const { tenantSlug, lookupMethod, reference, plate, lastName } = await req.json();

    console.log('Manage booking login attempt:', { tenantSlug, lookupMethod, reference, plate, lastName });

    if (!tenantSlug) {
      return NextResponse.json({ message: 'Missing tenant slug.' }, { status: 400 });
    }

    // Validate lookup method and required fields
    if (lookupMethod === 'reference') {
      if (!reference || !lastName) {
        return NextResponse.json({ message: 'Missing fields. Reference and last name are required.' }, { status: 400 });
      }
    } else if (lookupMethod === 'plate') {
      if (!plate) {
        return NextResponse.json({ message: 'Missing fields. Registration plate is required.' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ message: 'Invalid lookup method. Use "reference" or "plate".' }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const supabase = createServerClientDirect({ admin: true });

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

    // Query booking based on lookup method
    let query = supabase
      .from('bookings')
      .select('id, tenant_id, reference, customer_name, customer_email, plate, car_make, car_model, car_color, flight_number, start_at, end_at, source')
      .eq('tenant_id', tenant.id);

    if (lookupMethod === 'reference') {
      query = query.eq('reference', reference);
    } else {
      // Normalize plate: uppercase and remove spaces
      const normalizedPlate = plate.toUpperCase().replace(/\s+/g, '');
      query = query.eq('plate', normalizedPlate);
    }

    const { data: booking, error: berr } = await query.maybeSingle();

    console.log('Booking lookup result:', { booking, error: berr });

    if (berr || !booking) {
      return NextResponse.json({ message: 'Booking not found.' }, { status: 404 });
    }

    // Name verification (required for reference lookup, optional for plate lookup)
    if (lastName) {
      const bookingLast = normalizeLastName(booking.customer_name.split(/\s+/).slice(-1)[0] || '');
      const providedLast = normalizeLastName(lastName);

      if (!bookingLast || bookingLast !== providedLast) {
        return NextResponse.json({ 
          message: lookupMethod === 'reference' 
            ? 'Name and reference do not match.' 
            : 'Name and registration plate do not match.' 
        }, { status: 401 });
      }
    } else if (lookupMethod === 'reference') {
      // Last name is required for reference lookup
      return NextResponse.json({ message: 'Last name is required for reference lookup.' }, { status: 400 });
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
