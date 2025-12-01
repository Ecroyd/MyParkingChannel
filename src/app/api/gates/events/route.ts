// app/api/gates/events/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { hashGateDeviceKey } from '@/lib/devices/gateDeviceKeys';

const supabase = createAdminClient();

type GateEventPayload = {
  plate?: string;
  qr_code?: string;
  direction: 'entry' | 'exit';
  seenAt?: string; // ISO timestamp from Snap, optional
  raw?: unknown;   // original vendor payload if you want to store it later
};

function normalisePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-gate-api-key');
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing x-gate-api-key header' }, { status: 401 });
  }

  const apiKeyHash = hashGateDeviceKey(apiKey);

  // 1) Find the device by hashed key
  const { data: device, error: deviceError } = await supabase
    .from('gate_devices')
    .select('id, tenant_id, status, kind')
    .eq('api_key_hash', apiKeyHash)
    .maybeSingle();

  if (deviceError || !device) {
    return NextResponse.json({ error: 'Unknown device key' }, { status: 401 });
  }

  if (device.status !== 'active') {
    return NextResponse.json({ error: 'Device not active' }, { status: 403 });
  }

  let body: GateEventPayload;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.plate && !body.qr_code) {
    return NextResponse.json(
      { error: 'Either plate or qr_code must be provided' },
      { status: 400 },
    );
  }

  if (!body.direction) {
    return NextResponse.json({ error: 'direction is required' }, { status: 400 });
  }

  const eventAt = body.seenAt ? new Date(body.seenAt) : new Date();
  const tenantId = device.tenant_id;
  const plateNormalised = body.plate ? normalisePlate(body.plate) : null;

  // 2) Try to match booking by plate (for ANPR)
  let matchedBookingId: string | null = null;
  let result: 'allow' | 'deny' = 'deny';
  let reason: string | null = null;

  if (plateNormalised) {
    const earlyToleranceHours = 4;
    const lateToleranceHours = 8;
    const from = new Date(eventAt.getTime() - earlyToleranceHours * 3600_000).toISOString();
    const to = new Date(eventAt.getTime() + lateToleranceHours * 3600_000).toISOString();

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, start_at, end_at, status, checked_in_at, checked_out_at')
      .eq('tenant_id', tenantId)
      .ilike('plate', plateNormalised)
      .lte('start_at', to)
      .gte('end_at', from)
      .order('start_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!bookingError && booking?.id) {
      matchedBookingId = booking.id;
      result = 'allow';
      reason = null;

      // Update check-in / check-out timestamps on the booking
      if (body.direction === 'entry') {
        // Only set checked_in_at if not already set (don't overwrite existing)
        await supabase
          .from('bookings')
          .update({ 
            checked_in_at: booking.checked_in_at || eventAt.toISOString(),
            checked_out_at: null, // Clear check-out if they're checking in again
            gate_status: 'arrived'
          })
          .eq('id', booking.id);
      } else if (body.direction === 'exit') {
        // Set checked_out_at, and ensure checked_in_at is set if missing
        await supabase
          .from('bookings')
          .update({ 
            checked_out_at: eventAt.toISOString(),
            checked_in_at: booking.checked_in_at || eventAt.toISOString(),
            gate_status: 'departed'
          })
          .eq('id', booking.id);
      }
    } else {
      result = 'deny';
      reason = 'No matching booking for plate';
    }
  } else {
    // If this is a QR event instead
    result = 'allow'; // assuming QR already implies valid – adjust as needed
    reason = null;
  }

  // 3) Insert gate_event row
  const mode =
    body.direction === 'entry'
      ? 'entry' // must be a valid value in public.gate_mode
      : 'exit';

  const { data: event, error: eventError } = await supabase
    .from('gate_events')
    .insert({
      tenant_id: tenantId,
      device_id: device.id,
      event_at: eventAt.toISOString(),
      mode,                // public.gate_mode
      plate: plateNormalised,
      qr_code: body.qr_code ?? null,
      booking_id: matchedBookingId,
      result,              // public.gate_result
      reason,
    } as any) // `as any` because of enum types in generated Database
    .select()
    .single();

  if (eventError) {
    console.error('[GATE] Failed to insert gate_event', eventError);
    return NextResponse.json(
      { error: 'Failed to record gate event' },
      { status: 500 },
    );
  }

  // 4) Touch last_seen on the device
  await supabase
    .from('gate_devices')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', device.id);

  return NextResponse.json({
    ok: true,
    eventId: event.id,
    bookingId: matchedBookingId,
    result,
  });
}

