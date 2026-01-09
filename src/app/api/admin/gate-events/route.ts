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

    // Build date filters
    let fromDateFilter: string | null = null;
    let toDateFilter: string | null = null;
    
    if (from) {
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      fromDateFilter = fromDate.toISOString();
    }

    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      toDateFilter = toDate.toISOString();
    }

    // Fetch gate_events (old system)
    let gateEventsQuery = adminClient
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

    if (fromDateFilter) {
      gateEventsQuery = gateEventsQuery.gte('event_at', fromDateFilter);
    }
    if (toDateFilter) {
      gateEventsQuery = gateEventsQuery.lte('event_at', toDateFilter);
    }

    const { data: gateEvents, error: gateEventsError } = await gateEventsQuery;

    if (gateEventsError) {
      console.error('Error fetching gate events:', gateEventsError);
    }

    // Fetch anpr_events (new system)
    let anprEventsQuery = adminClient
      .from('anpr_events')
      .select(`
        id,
        event_at,
        direction,
        plate_raw,
        camera_id,
        status,
        booking_id,
        bookings(
          id,
          reference,
          status
        )
      `)
      .eq('tenant_id', tenantId)
      .order('event_at', { ascending: false })
      .limit(limit);

    if (fromDateFilter) {
      anprEventsQuery = anprEventsQuery.gte('event_at', fromDateFilter);
    }
    if (toDateFilter) {
      anprEventsQuery = anprEventsQuery.lte('event_at', toDateFilter);
    }

    const { data: anprEvents, error: anprEventsError } = await anprEventsQuery;

    if (anprEventsError) {
      console.error('Error fetching anpr events:', anprEventsError);
    }

    // Transform gate_events to match client expectations
    const transformedGateEvents = (gateEvents || []).map((event: any) => {
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

    // Transform anpr_events to match gate_events format
    const transformedAnprEvents = (anprEvents || []).map((event: any) => {
      const booking = Array.isArray(event.bookings) 
        ? event.bookings[0] 
        : event.bookings;

      // Map anpr_events status to gate_events result format
      let result = 'deny';
      if (event.status === 'matched' || event.status === 'corrected') {
        result = 'allow';
      } else if (event.status === 'unmatched') {
        result = 'deny';
      }

      // Map direction to mode
      let mode = 'anpr';
      if (event.direction === 'in') {
        mode = 'entry';
      } else if (event.direction === 'out') {
        mode = 'exit';
      }

      return {
        id: event.id,
        event_at: event.event_at,
        mode: mode,
        plate: event.plate_raw,
        qr_code: null,
        result: result,
        reason: event.status === 'unmatched' ? 'No booking match' : event.status === 'matched' ? 'Matched to booking' : event.status,
        device_name: event.camera_id ? `Camera ${event.camera_id}` : 'ANPR Camera',
        booking_reference: booking?.reference || null,
        booking_status: booking?.status || null,
      };
    });

    // Combine and sort by event_at descending
    const allEvents = [...transformedGateEvents, ...transformedAnprEvents].sort((a, b) => {
      return new Date(b.event_at).getTime() - new Date(a.event_at).getTime();
    }).slice(0, limit);

    return NextResponse.json({ events: allEvents });
  } catch (error: any) {
    console.error('Gate events API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

