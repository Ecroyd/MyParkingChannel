// POST /api/integrations/anpr/webhook
// ANPR vendor webhook endpoint with Bearer token authentication

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { hashGateDeviceKey } from '@/lib/devices/gateDeviceKeys';
import crypto from 'crypto';

const supabase = createAdminClient();

function normalisePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// Tolerant payload parser - handles various vendor formats
function parseAnprPayload(body: any): {
  plate: string | null;
  event_at: Date;
  camera_id: string | null;
  lane: string | null;
  direction: 'entry' | 'exit' | null;
} {
  // Try multiple field names for plate
  const plateRaw = body.plate || body.license || body.registration || body.vehicle_reg || body.number_plate || '';
  const plate = plateRaw ? normalisePlate(String(plateRaw)) : null;

  // Try multiple field names for timestamp
  const eventAtRaw = body.event_at || body.timestamp || body.seen_at || body.detected_at || body.time || new Date().toISOString();
  const eventAt = new Date(eventAtRaw);

  // Try multiple field names for camera/lane
  const camera_id = body.camera_id || body.camera || body.cameraId || body.device_id || null;
  const lane = body.lane || body.lane_id || body.laneId || null;

  // Try to infer direction from camera_direction_map or use explicit direction
  let direction: 'entry' | 'exit' | null = null;
  if (body.direction) {
    const dir = String(body.direction).toLowerCase();
    direction = (dir === 'entry' || dir === 'in' || dir === 'arrival') ? 'entry' : 
                (dir === 'exit' || dir === 'out' || dir === 'departure') ? 'exit' : null;
  }

  return { plate, event_at: eventAt, camera_id, lane, direction };
}

export async function POST(req: NextRequest) {
  try {
    // 1) Authenticate via Bearer token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header. Expected: Bearer <token>' },
        { status: 401 }
      );
    }

    const deviceToken = authHeader.substring(7); // Remove "Bearer " prefix
    const apiKeyHash = hashGateDeviceKey(deviceToken);

    // Find device by hashed key
    const { data: device, error: deviceError } = await supabase
      .from('gate_devices')
      .select('id, tenant_id, status, kind, name')
      .eq('api_key_hash', apiKeyHash)
      .maybeSingle();

    if (deviceError || !device) {
      return NextResponse.json(
        { error: 'Invalid device token' },
        { status: 401 }
      );
    }

    if (device.status !== 'active') {
      return NextResponse.json(
        { error: 'Device not active' },
        { status: 403 }
      );
    }

    const tenantId = device.tenant_id;

    // 2) Get ANPR config for tenant
    const { data: config } = await supabase
      .from('tenant_anpr_config')
      .select('enabled, dedupe_seconds, camera_direction_map, arrival_grace_minutes, departure_grace_minutes')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!config || !config.enabled) {
      return NextResponse.json(
        { error: 'ANPR integration not enabled for this tenant' },
        { status: 403 }
      );
    }

    // 3) Parse request body
    let rawBody: string;
    let payload: any;
    try {
      rawBody = await req.text();
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // 4) Parse ANPR payload (tolerant parsing)
    const { plate, event_at, camera_id, lane, direction: parsedDirection } = parseAnprPayload(payload);

    if (!plate) {
      return NextResponse.json(
        { error: 'Plate number is required' },
        { status: 400 }
      );
    }

    // 5) Determine direction from camera_direction_map if not provided
    let direction: 'entry' | 'exit' = 'entry'; // default
    if (parsedDirection) {
      direction = parsedDirection;
    } else if (camera_id && config.camera_direction_map) {
      const map = config.camera_direction_map as Record<string, string>;
      const mappedDir = map[camera_id] || map[String(camera_id)];
      if (mappedDir === 'entry' || mappedDir === 'exit') {
        direction = mappedDir;
      }
    }

    // 6) Create idempotency key for deduplication
    // Format: sha256(tenant_id + plate + event_at + JSON.stringify(body).slice(0,500))
    const bodyPrefix = JSON.stringify(payload).slice(0, 500);
    const idempotencyKeyRaw = `${tenantId}${plate}${event_at.toISOString()}${bodyPrefix}`;
    const idempotencyKey = crypto.createHash('sha256').update(idempotencyKeyRaw).digest('hex');
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');

    // 7) Check for duplicate event (dedupe via integration_events)
    const dedupeWindow = new Date(event_at.getTime() - (config.dedupe_seconds * 1000));
    const { data: existingEvent } = await supabase
      .from('integration_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingEvent) {
      // Already processed - return success but don't process again
      return NextResponse.json({
        ok: true,
        message: 'Event already processed',
        duplicate: true,
      });
    }

    // 8) Store raw payload in integration_events (with dedupe check)
    const { error: integrationEventError } = await supabase
      .from('integration_events')
      .insert({
        tenant_id: tenantId,
        direction: 'inbound',
        event_type: 'anpr_detection',
        idempotency_key: idempotencyKey,
        payload_hash: payloadHash,
        status: 'processing',
        http_status: 200,
        payload: payload,
      });

    if (integrationEventError) {
      // Check if it's a unique constraint violation (duplicate)
      if (integrationEventError.code === '23505' || integrationEventError.message?.includes('unique')) {
        // Already processed - return success but don't process again
        return NextResponse.json({
          ok: true,
          message: 'Event already processed',
          deduped: true,
        });
      }
      console.error('[ANPR] Failed to insert integration_event:', integrationEventError);
      // Continue anyway - don't fail the webhook
    }

    // 9) Check if this is a staff vehicle first (staff vehicles always allowed)
    const { data: staffVehicle } = await supabase
      .from('staff_vehicles')
      .select('id, description')
      .eq('tenant_id', tenantId)
      .eq('plate', plate)
      .eq('is_active', true)
      .maybeSingle();

    let matchedBookingId: string | null = null;
    let result: 'allow' | 'deny' = 'deny';
    let reason: string | null = null;

    // If it's a staff vehicle, always allow
    if (staffVehicle) {
      result = 'allow';
      reason = 'Staff vehicle - always allowed';
    } else {
      // Try to match booking by plate with grace periods
      const arrivalGrace = config.arrival_grace_minutes || 240; // 4 hours default
      const departureGrace = config.departure_grace_minutes || 480; // 8 hours default

      if (direction === 'entry') {
      const from = new Date(event_at.getTime() - arrivalGrace * 60 * 1000).toISOString();
      const to = new Date(event_at.getTime() + departureGrace * 60 * 1000).toISOString();

      const { data: booking } = await supabase
        .from('bookings')
        .select('id, start_at, end_at, status')
        .eq('tenant_id', tenantId)
        .ilike('plate', plate)
        .lte('start_at', to)
        .gte('end_at', from)
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (booking?.id) {
        matchedBookingId = booking.id;
        result = 'allow';
        reason = 'observed';
      } else {
        result = 'deny';
        reason = 'No matching booking for plate';
      }
    } else {
      // Exit - check if they have an active booking
      const from = new Date(event_at.getTime() - departureGrace * 60 * 1000).toISOString();
      const to = new Date(event_at.getTime() + departureGrace * 60 * 1000).toISOString();

      const { data: booking } = await supabase
        .from('bookings')
        .select('id, start_at, end_at, status')
        .eq('tenant_id', tenantId)
        .ilike('plate', plate)
        .lte('start_at', to)
        .gte('end_at', from)
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (booking?.id) {
        matchedBookingId = booking.id;
        result = 'allow';
        reason = 'observed';
      } else {
        result = 'deny';
        reason = 'No matching booking for plate';
      }
    }
    }

    // 10) Insert gate_events row with mode='anpr'
    const { data: event, error: eventError } = await supabase
      .from('gate_events')
      .insert({
        tenant_id: tenantId,
        device_id: device.id,
        event_at: event_at.toISOString(),
        mode: 'anpr', // Use 'anpr' mode for ANPR integration events
        plate,
        qr_code: null,
        booking_id: matchedBookingId,
        result,
        reason: reason || 'observed',
      } as any)
      .select()
      .single();

    if (eventError) {
      console.error('[ANPR] Failed to insert gate_event:', eventError);
      // Update integration_event status
      await supabase
        .from('integration_events')
        .update({ status: 'failed', http_status: 500 })
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', idempotencyKey);
      
      return NextResponse.json(
        { error: 'Failed to record gate event' },
        { status: 500 }
      );
    }

    // 11) Update integration_event status to success
    await supabase
      .from('integration_events')
      .update({ status: 'success', http_status: 200 })
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey);

    // 12) Update gate_devices.last_seen
    await supabase
      .from('gate_devices')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', device.id);

    return NextResponse.json({
      ok: true,
      eventId: event.id,
      bookingId: matchedBookingId,
      result,
      reason,
    });
  } catch (error: any) {
    console.error('[ANPR] Webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
