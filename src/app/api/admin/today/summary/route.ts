import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";

export async function GET() {
  try {
    const sb = getServiceSupabase();
    // TODO: replace with your real summary query
    // const { data, error } = await sb.rpc("admin_today_summary", { /* ... */ });
    return NextResponse.json({ ok: true, data: {} });
  } catch (e:any) {
    // Graceful error so UI doesn't die
    return NextResponse.json({ ok:false, error: e.message }, { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('POST /api/admin/today/summary called with:', body);
    
    const sb = getServiceSupabase();
    
    // Get tenant info to find capacity
    const { data: tenant, error: tenantError } = await sb
      .from('tenants')
      .select('id, name, default_capacity')
      .eq('slug', body.tenant)
      .single();
    
    if (tenantError || !tenant) {
      console.error('Tenant not found:', tenantError);
      return NextResponse.json({ 
        ok: true, 
        data: {
          arrivals: 0,
          departures: 0,
          checkedIn: 0,
          capacityRemaining: 0,
          totalCapacity: 0
        } 
      });
    }
    
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    // Get today's bookings
    const { data: bookings, error: bookingsError } = await sb
      .from('bookings')
      .select('id, status, start_at, end_at')
      .eq('tenant_id', tenant.id)
      .gte('start_at', startOfDay.toISOString())
      .lt('start_at', endOfDay.toISOString());
    
    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      return NextResponse.json({ 
        ok: true, 
        data: {
          arrivals: 0,
          departures: 0,
          checkedIn: 0,
          capacityRemaining: tenant.default_capacity || 0,
          totalCapacity: tenant.default_capacity || 0
        } 
      });
    }
    
    // Calculate metrics
    const arrivals = bookings?.filter(b => b.status === 'checked_in' || b.status === 'reserved').length || 0;
    const departures = bookings?.filter(b => b.status === 'checked_out').length || 0;
    const checkedIn = bookings?.filter(b => b.status === 'checked_in').length || 0;
    const totalCapacity = tenant.default_capacity || 0;
    const capacityRemaining = Math.max(0, totalCapacity - checkedIn);
    
    return NextResponse.json({ 
      ok: true, 
      data: {
        arrivals,
        departures,
        checkedIn,
        capacityRemaining,
        totalCapacity
      } 
    });
  } catch (e:any) {
    console.error('POST /api/admin/today/summary error:', e);
    // Graceful error so UI doesn't die
    return NextResponse.json({ ok:false, error: e.message }, { status: 200 });
  }
}
