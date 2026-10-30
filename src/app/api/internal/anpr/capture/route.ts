// POST /api/internal/anpr/capture - Insert ANPR capture events into gate_events
// Authenticated via relay token (see src/lib/anpr/relayTokenAuth.ts)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { applyBookingOccupancyAction } from '@/lib/ops/occupancyAction';
import {
  normalizePlate,
  pickCaptureBooking,
  plateIlikePattern,
} from '@/lib/anpr/captureBookingMatch';
import { authenticateGatewayRequest, touchGatewayDevice } from '@/lib/anpr/gatewayDevice';

// Where the read came from (gate_events.source). Defaults to 'videofit' for the existing relay.
const SOURCE_RE = /^[a-z0-9_-]{1,32}$/;

/**
 * Compute event_hash = sha256(tenantId|plate_norm|occurred_at|direction|camera_id|lane)
 */
function computeEventHash(
  tenantId: string,
  plateNorm: string,
  occurredAt: string,
  direction: string,
  cameraId: string | null,
  lane: string | null
): string {
  const parts = [
    tenantId,
    plateNorm,
    occurredAt,
    direction,
    cameraId || '',
    lane || '',
  ];
  const input = parts.join('|');
  return crypto.createHash('sha256').update(input).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    // Get tenantId from query params
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId query parameter is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Paired gateways send their own device key (x-gateway-key); other relays use the tenant relay
    // token (Bearer / x-relay-token / ?token=: tenant_secrets, anpr_sites hash or legacy env).
    const auth = await authenticateGatewayRequest(req, supabase, tenantId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Parse request body
    let body: {
      plate: string;
      occurred_at: string;
      direction: 'in' | 'out';
      camera_id?: string | null;
      lane?: string | null;
      confidence?: number | null;
      source?: string | null;
      device_id?: string | null;
      raw?: unknown;
    };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.plate) {
      return NextResponse.json(
        { error: 'plate is required' },
        { status: 400 }
      );
    }

    if (!body.occurred_at) {
      return NextResponse.json(
        { error: 'occurred_at is required' },
        { status: 400 }
      );
    }

    if (!body.direction || (body.direction !== 'in' && body.direction !== 'out')) {
      return NextResponse.json(
        { error: 'direction must be "in" or "out"' },
        { status: 400 }
      );
    }

    const source = body.source ?? 'videofit';
    if (!SOURCE_RE.test(source)) {
      return NextResponse.json(
        { error: 'source must be 1-32 characters of a-z, 0-9, "_" or "-"' },
        { status: 400 }
      );
    }

    // Gateway identity: marks the gate device as seen (admin "connected" state) and is stored on
    // the gate event. A device key implies the device; with a relay token, device_id is optional.
    // An unknown or inactive device is rejected so misconfiguration shows up at the gateway.
    const deviceId = auth.via === 'gateway_key' ? auth.deviceId : body.device_id ?? null;
    if (deviceId !== null) {
      const touched = await touchGatewayDevice(supabase, tenantId, deviceId);
      if (!touched.ok) {
        return NextResponse.json({ error: touched.error }, { status: touched.status });
      }
    }

    // Normalize plate
    const plateNorm = normalizePlate(body.plate);
    if (!plateNorm) {
      return NextResponse.json(
        { error: 'plate must contain at least one alphanumeric character' },
        { status: 400 }
      );
    }

    // Parse occurred_at
    const occurredAt = new Date(body.occurred_at);
    if (isNaN(occurredAt.getTime())) {
      return NextResponse.json(
        { error: 'occurred_at must be a valid ISO timestamp' },
        { status: 400 }
      );
    }

    const occurredAtIso = occurredAt.toISOString();

    // Compute event_hash
    const eventHash = computeEventHash(
      tenantId,
      plateNorm,
      occurredAtIso,
      body.direction,
      body.camera_id || null,
      body.lane || null
    );

    const mode = 'anpr';

    // Store raw plate and normalized plate
    const rawPlate = body.plate;

    // Prepare raw_payload: use body.raw if provided, otherwise entire body
    const rawPayload = body.raw !== undefined ? body.raw : body;

    // Prepare gate_events insert data
    const gateEventData: any = {
      tenant_id: tenantId,
      event_at: occurredAtIso,
      mode,
      direction: body.direction, // Store direction ('in'|'out')
      plate: rawPlate, // Store raw plate
      plate_norm: plateNorm, // Store normalized plate
      source,
      raw_payload: JSON.stringify(rawPayload),
      confidence: body.confidence ?? null,
      lane: body.lane ?? null,
      camera_id: body.camera_id ?? null,
      device_id: deviceId,
      event_hash: eventHash,
      result: 'deny', // Initial value
      reason: 'unprocessed', // Initial value
      booking_id: null,
      processed_at: null,
    };

    // Try to insert gate_events row
    const { data: insertedEvent, error: insertError } = await supabase
      .from('gate_events')
      .insert(gateEventData)
      .select()
      .single();

    // Handle duplicate event_hash
    if (insertError) {
      // Check if it's a unique constraint violation on event_hash
      if (insertError.code === '23505' || insertError.message?.includes('event_hash') || insertError.message?.includes('unique')) {
        return NextResponse.json(
          { ok: true, duplicate: true },
          { status: 200 }
        );
      }

      console.error('[ANPR Capture] Failed to insert gate_event:', insertError);
      return NextResponse.json(
        { error: 'Failed to insert gate event', details: insertError.message },
        { status: 500 }
      );
    }

    // Match booking by tenant + plate_norm + overlap window (±6h around start/end)
    const windowStart = new Date(occurredAt.getTime() - 6 * 60 * 60 * 1000); // -6 hours
    const windowEnd = new Date(occurredAt.getTime() + 6 * 60 * 60 * 1000); // +6 hours

    // Booking plates may be saved with spaces ("AB12 CDE"); the pattern matches any spacing and
    // pickCaptureBooking keeps only exact normalised matches.
    const platePattern = plateIlikePattern(plateNorm);
    const { data: bookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id, start_at, end_at, status, arrived_at, departed_at, ops_status, plate')
      .eq('tenant_id', tenantId)
      .ilike('plate', platePattern)
      .lte('start_at', windowEnd.toISOString())
      .gte('end_at', windowStart.toISOString())
      .neq('status', 'cancelled')
      .order('start_at', { ascending: true });

    if (bookingError) {
      console.error('[ANPR Capture] Booking lookup failed:', bookingError);
    }

    let matchedBooking = pickCaptureBooking(bookings ?? [], plateNorm, body.direction, occurredAt);

    // Overstay: a departure more than 6h after the booked end falls outside the window above.
    // Check the vehicle out of the most recent booking it arrived on and never left.
    if (!matchedBooking && body.direction === 'out') {
      const { data: openStays, error: openStayError } = await supabase
        .from('bookings')
        .select('id, start_at, end_at, status, arrived_at, departed_at, ops_status, plate')
        .eq('tenant_id', tenantId)
        .ilike('plate', platePattern)
        .not('arrived_at', 'is', null)
        .is('departed_at', null)
        .lte('start_at', occurredAtIso)
        .neq('status', 'cancelled')
        .order('start_at', { ascending: false })
        .limit(10);

      if (openStayError) {
        console.error('[ANPR Capture] Open-stay lookup failed:', openStayError);
      }
      matchedBooking =
        (openStays ?? []).find((b) => normalizePlate(b.plate) === plateNorm) ?? null;
    }

    let bookingId: string | null = null;
    let result = 'deny';
    let reason: string | null = 'no booking match';
    const now = new Date().toISOString();

    if (matchedBooking) {
      bookingId = matchedBooking.id;

      try {
        await applyBookingOccupancyAction({
          bookingId: matchedBooking.id,
          action: body.direction === 'in' ? 'arrived' : 'departed',
          source: 'anpr',
          eventAt: occurredAtIso,
          metadata: { provider: 'internal_capture', capture_source: source },
        });
        result = 'allow';
        reason = null;
      } catch (err) {
        console.error('[ANPR Capture] Occupancy action failed:', err);
      }
    }

    // Update gate_events row with booking_id, processed_at, result, reason
    const updateData: any = {
      processed_at: now,
      result,
      reason,
    };

    if (bookingId) {
      updateData.booking_id = bookingId;
    }

    const { error: updateEventError } = await supabase
      .from('gate_events')
      .update(updateData)
      .eq('id', insertedEvent.id);

    if (updateEventError) {
      console.error('[ANPR Capture] Failed to update gate_event:', updateEventError);
      // Continue anyway - the event was inserted
    }

    return NextResponse.json({
      ok: true,
      duplicate: false,
      eventId: insertedEvent.id,
      bookingId,
      result,
      reason,
    });
  } catch (error: any) {
    console.error('[ANPR Capture] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}


