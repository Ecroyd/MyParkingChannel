import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = parseInt(searchParams.get('limit') || '200', 10);

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Build query for gate events
    let query = adminClient
      .from('gate_events')
      .select(`
        id,
        event_at,
        mode,
        plate,
        qr_code,
        result,
        reason,
        device_id,
        booking_id,
        gate_devices(
          id,
          name
        ),
        bookings(
          id,
          reference,
          status
        )
      `)
      .eq('tenant_id', tenantId)
      .order('event_at', { ascending: false })
      .limit(limit);

    // Add date filters if provided
    if (from) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      query = query.gte('event_at', fromDate.toISOString());
    }

    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      query = query.lte('event_at', toDate.toISOString());
    }

    const { data: events, error: eventsError } = await query;

    if (eventsError) {
      console.error('Error fetching gate events:', eventsError);
      return NextResponse.json(
        { error: 'Failed to fetch gate events' },
        { status: 500 }
      );
    }

    // Transform events to match client expectations
    const transformedEvents = (events || []).map((event: any) => {
      // Handle both array and single object responses from Supabase
      const device = Array.isArray(event.gate_devices) 
        ? event.gate_devices[0] 
        : event.gate_devices;
      const booking = Array.isArray(event.bookings) 
        ? event.bookings[0] 
        : event.bookings;

      return {
        id: event.id,
        event_at: event.event_at,
        mode: event.mode,
        plate: event.plate,
        qr_code: event.qr_code,
        result: event.result,
        reason: event.reason,
        device_name: device?.name || 'Unknown',
        booking_reference: booking?.reference || null,
        booking_status: booking?.status || null,
      };
    });

    return NextResponse.json({ events: transformedEvents });
  } catch (error: any) {
    console.error('Gate events API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

