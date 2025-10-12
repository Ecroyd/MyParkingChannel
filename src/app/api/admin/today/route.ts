import { createAdminClient } from '@/lib/supabase/server-admin';
import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getDateRangeForQuery } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  try {
    console.log("🛰 API received date range query:", request.url);
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    console.log("Parsed from:", from, "as", new Date(from || '').toISOString());
    console.log("Parsed to:", to, "as", new Date(to || '').toISOString());
    
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
    
    console.log("📊 Query range:", { 
      from: startOfDayUTC.toISOString(), 
      to: endOfDayUTC.toISOString() 
    });

    // Get arrivals (bookings STARTING in the date range)
    const { data: arrivals, error: arrivalsError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('start_at', startOfDayUTC.toISOString())
      .lte('start_at', endOfDayUTC.toISOString())
      .order('start_at', { ascending: false });
    
    console.log("📦 Arrivals (starting in range):", arrivals?.map(b => ({
      ref: b.reference,
      start_at: b.start_at,
      end_at: b.end_at
    })) || []);

    // Get departures (bookings ENDING in the date range)
    const { data: departures, error: departuresError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('end_at', startOfDayUTC.toISOString())
      .lte('end_at', endOfDayUTC.toISOString())
      .order('end_at', { ascending: false });
    
    console.log("📦 Departures (ending in range):", departures?.map(b => ({
      ref: b.reference,
      start_at: b.start_at,
      end_at: b.end_at
    })) || []);

    // Get currently parked cars (started before now, ending after now)
    const now = new Date();
    const { data: currentlyParked, error: currentlyParkedError } = await adminClient
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .lte('start_at', now.toISOString())
      .gte('end_at', now.toISOString())
      .in('status', ['reserved', 'checked_in']);
    
    console.log("📦 Currently parked (active now):", currentlyParked?.map(b => ({
      ref: b.reference,
      start_at: b.start_at,
      end_at: b.end_at,
      status: b.status
    })) || []);

    // Calculate revenue for the date range
    const { data: rangeBookings, error: revenueError } = await adminClient
      .from('bookings')
      .select('money_received')
      .eq('tenant_id', tenantId)
      .gte('start_at', startOfDayUTC.toISOString())
      .lte('start_at', endOfDayUTC.toISOString())
      .not('money_received', 'is', null);

    const totalRevenue = rangeBookings?.reduce((sum, booking) => sum + (booking.money_received || 0), 0) || 0;

    // Calculate KPIs
    const kpis = {
      arrivals: arrivals?.length || 0,
      departures: departures?.length || 0,
      checkedIn: currentlyParked?.length || 0,
      capacityLeft: (tenant.default_capacity || 0) - (currentlyParked?.length || 0),
      totalRevenue
    };

    return NextResponse.json({
      tenant,
      kpis,
      arrivals: arrivals || [],
      departures: departures || [],
      currentlyParked: currentlyParked || []
    });

  } catch (error) {
    console.error('Today API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
