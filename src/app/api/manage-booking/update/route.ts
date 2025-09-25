import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getServerSupabase } from '@/lib/supabase/server';
import { createServerClientDirect } from '@/lib/supabase/server-direct';

const COOKIE_NAME = 'booking_session';
const secret = new TextEncoder().encode(process.env.BOOKING_SESSION_SECRET || 'change-me-in-env');

// whitelist keys customers are allowed to change
const ALLOWED: Record<string, true> = {
  plate: true,
  car_make: true,
  car_model: true,
  car_color: true,
  customer_email: true,
  flight_number: true,
};

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(COOKIE_NAME)?.value;
    
    if (!cookie) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const { payload } = await jwtVerify(cookie, secret);
    const booking_id = payload['booking_id'] as string;
    const tenant_id = payload['tenant_id'] as string;
    const reference = payload['reference'] as string;

    const { changes } = await req.json();

    if (!changes || typeof changes !== 'object') {
      return NextResponse.json({ message: 'No changes provided.' }, { status: 400 });
    }

    // filter to allowed fields only
    const allowedChanges: Record<string, any> = {};
    Object.keys(changes).forEach((k) => {
      if (ALLOWED[k]) allowedChanges[k] = changes[k];
    });

    if (Object.keys(allowedChanges).length === 0) {
      return NextResponse.json({ message: 'Nothing to update.' }, { status: 400 });
    }

    const supabase = createServerClientDirect({ admin: true });

    console.log('Update booking attempt:', { 
      tenant_id, 
      booking_id, 
      reference, 
      allowedChanges 
    });

    // Try RPC function first, fallback to direct update if RPC doesn't exist
    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_customer_booking', {
      p_tenant_id: tenant_id,
      p_reference: reference,
      p_plate: allowedChanges.plate || null,
      p_car_make: allowedChanges.car_make || null,
      p_car_model: allowedChanges.car_model || null,
      p_car_color: allowedChanges.car_color || null,
      p_flight_number: allowedChanges.flight_number || null,
      p_last_name: null, // Not provided in the form
      p_notes: null, // Not provided in the form
    });

    console.log('RPC result:', { rpcResult, error: rpcError });

    if (rpcError) {
      console.log('RPC function failed, falling back to direct update:', rpcError.message);
      
      // Fallback to direct table update
      const { error: updateError } = await supabase
        .from('bookings')
        .update(allowedChanges)
        .eq('id', booking_id)
        .eq('tenant_id', tenant_id);

      if (updateError) {
        console.error('Direct update error:', updateError);
        return NextResponse.json({ message: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ 
        ok: true, 
        message: 'Booking updated successfully' 
      });
    }

    // Check the RPC result
    if (rpcResult && !rpcResult.success) {
      console.error('RPC function returned error:', rpcResult.error);
      return NextResponse.json({ message: rpcResult.error }, { status: 400 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: rpcResult?.message || 'Booking updated successfully' 
    });
  } catch (e: any) {
    console.error('Manage booking update error:', e);
    return NextResponse.json({ message: e.message || 'Update failed.' }, { status: 500 });
  }
}
