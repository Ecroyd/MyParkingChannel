import { createAdminClient } from '@/lib/supabase/server-admin';
import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getDateRangeForQuery } from '@/lib/timezone';
import { calculateCapacityForDate } from '@/lib/capacity/rolling';

export const dynamic = "force-dynamic";

function isCancelledBooking(booking: { status?: string | null; gate_status?: string | null }) {
  return booking.status === 'cancelled' || booking.gate_status === 'cancelled';
}

function isNoShowBooking(booking: { gate_status?: string | null }) {
  return booking.gate_status === 'no_show';
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    
    const supabase = await createServerClient();
    const adminClient = await createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user's tenant
    const { data: userTenants, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (userTenantsError || !userTenants?.length) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    // Get the default tenant or first tenant
    const defaultTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;

    // Get tenant details
    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('id, name, slug, timezone, default_capacity')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Get date range from query parameters
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'Date range parameters required' }, { status: 400 });
    }

    // Parse dates and convert to UTC for database queries
    const { fromUTC: startOfDayUTC, toUTC: endOfDayUTC } = getDateRangeForQuery(fromDate, toDate, tenant.timezone);
    

    // Get arrivals (bookings STARTING in the date range)
    const { data: arrivals, error: arrivalsError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('start_at', startOfDayUTC.toISOString())
      .lte('start_at', endOfDayUTC.toISOString())
      .order('start_at', { ascending: false });

    // Get departures (bookings ENDING in the date range) — include all; hidden filtered in UI
    const { data: departures, error: departuresError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('end_at', startOfDayUTC.toISOString())
      .lte('end_at', endOfDayUTC.toISOString())
      .order('end_at', { ascending: false });
    

    // Get bookings that overlap with the date range (for "currently parked" - shows who is/will be parked on each day)
    // A booking overlaps if: start_at < endOfRange AND end_at > startOfRange
    // Include all bookings that are meant to be in the car park (not cancelled)
    const { data: currentlyParked, error: currentlyParkedError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .lt('start_at', endOfDayUTC.toISOString())
      .gt('end_at', startOfDayUTC.toISOString())
      .neq('status', 'cancelled');

    // Get currently parked right now (for KPI stat)
    const now = new Date();
    const { data: currentlyParkedNow } = await adminClient
      .from('bookings')
      .select('id, status, gate_status')
      .eq('tenant_id', tenantId)
      .lte('start_at', now.toISOString())
      .gte('end_at', now.toISOString())
      .in('status', ['reserved', 'confirmed', 'checked_in']);

    // Calculate revenue for the date range
    const { data: rangeBookings, error: revenueError } = await adminClient
      .from('bookings')
      .select('money_received')
      .eq('tenant_id', tenantId)
      .gte('start_at', startOfDayUTC.toISOString())
      .lte('start_at', endOfDayUTC.toISOString())
      .not('money_received', 'is', null);

    const totalRevenue = rangeBookings?.reduce((sum, booking) => sum + (booking.money_received || 0), 0) || 0;

    // Calculate today's capacity using rolling capacity logic
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCapacity = await calculateCapacityForDate(tenantId, todayStr);
    const totalCapacity = todayCapacity ?? 0;

    const operationalArrivals = (arrivals || []).filter((booking) => !isCancelledBooking(booking));
    const operationalDepartures = (departures || []).filter(
      (booking) => !isCancelledBooking(booking) && !isNoShowBooking(booking)
    );
    const operationalCurrentlyParked = (currentlyParked || []).filter(
      (booking) => !isCancelledBooking(booking) && !isNoShowBooking(booking)
    );
    const operationalCurrentlyParkedNow = (currentlyParkedNow || []).filter(
      (booking) => !isCancelledBooking(booking) && !isNoShowBooking(booking)
    );

    // Calculate KPIs
    const kpis = {
      arrivals: operationalArrivals.length,
      departures: operationalDepartures.length,
      checkedIn: operationalCurrentlyParkedNow.length, // Currently parked right now
      capacityLeft: Math.max(0, totalCapacity - operationalCurrentlyParkedNow.length),
      totalRevenue
    };


    return NextResponse.json({
      tenant,
      kpis,
      arrivals: operationalArrivals,
      departures: operationalDepartures,
      currentlyParked: operationalCurrentlyParked
    });

  } catch (error) {
    console.error('Today API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
