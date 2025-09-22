import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { getServerSupabase } from '@/lib/supabase/server';

const COOKIE_NAME = 'booking_session';
const secret = new TextEncoder().encode(process.env.BOOKING_SESSION_SECRET || 'change-me-in-env');

// whitelist keys customers are allowed to change
const ALLOWED: Record<string, true> = {
  vehicle_reg: true,
  car_make: true,
  car_model: true,
  car_color: true,
  phone: true,
  flight_number: true,
  dropoff_time: true,
  pickup_time: true,
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

    const supabase = await getServerSupabase();

    console.log('Update booking attempt:', { 
      tenant_id, 
      booking_id, 
      reference, 
      allowedChanges 
    });

    // Try RPC function first, fallback to direct update if RPC doesn't exist
    try {
      const { data: rpcResult, error } = await supabase.rpc('update_customer_booking', {
        p_tenant_id: tenant_id,
        p_booking_id: booking_id,
        p_reference: reference,
        p_vehicle_reg: allowedChanges.vehicle_reg || null,
        p_car_make: allowedChanges.car_make || null,
        p_car_model: allowedChanges.car_model || null,
        p_car_color: allowedChanges.car_color || null,
        p_phone: allowedChanges.phone || null,
        p_flight_number: allowedChanges.flight_number || null,
        p_dropoff_time: allowedChanges.dropoff_time || null,
        p_pickup_time: allowedChanges.pickup_time || null,
      });

      console.log('RPC result:', { rpcResult, error });

      if (error) {
        console.error('Update booking RPC error:', error);
        return NextResponse.json({ message: error.message }, { status: 400 });
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
    } catch (rpcError: any) {
      console.log('RPC function not available, falling back to direct update:', rpcError.message);
      
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
  } catch (e: any) {
    console.error('Manage booking update error:', e);
    return NextResponse.json({ message: e.message || 'Update failed.' }, { status: 500 });
  }
}
