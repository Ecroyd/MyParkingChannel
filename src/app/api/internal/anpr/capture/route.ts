// POST /api/internal/anpr/capture - Insert ANPR capture events into gate_events
// Authenticated via Bearer token (tenant relay token from tenant_secrets)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import { applyBookingOccupancyAction } from '@/lib/ops/occupancyAction';

/**
 * Simple decryption helper (matches pattern from other integrations)
 */
function decryptSecret(encryptedValue: string): string {
  return Buffer.from(encryptedValue, 'base64').toString();
}

/**
 * Timing-safe comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Normalize plate: UPPER(alnum only)
 */
function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

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

    // Authenticate via Bearer token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header. Expected: Bearer <token>' },
        { status: 401 }
      );
    }

    const providedToken = authHeader.substring(7); // Remove "Bearer " prefix
    const supabase = createAdminClient();

    // Fetch relay token from tenant_secrets
    const { data: secret, error: secretError } = await supabase
      .from('tenant_secrets')
      .select('value_ciphertext')
      .eq('tenant_id', tenantId)
      .eq('scope', 'anpr')
      .eq('key', 'anpr_relay_token')
      .maybeSingle();

    if (secretError || !secret || !secret.value_ciphertext) {
      return NextResponse.json(
        { error: 'Invalid relay token' },
        { status: 401 }
      );
    }

    // Decrypt the stored token
    let storedToken: string;
    try {
      storedToken = decryptSecret(secret.value_ciphertext);
    } catch (error) {
      console.error('[ANPR Capture] Error decrypting relay token:', error);
      return NextResponse.json(
        { error: 'Invalid relay token' },
        { status: 401 }
      );
    }

    // Timing-safe comparison
    if (!timingSafeEqual(providedToken, storedToken)) {
      return NextResponse.json(
        { error: 'Invalid relay token' },
        { status: 401 }
      );
    }

    // Parse request body
    let body: {
      plate: string;
      occurred_at: string;
      direction: 'in' | 'out';
      camera_id?: string | null;
      lane?: string | null;
      confidence?: number | null;
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

    // For Videofit capture events: set mode='anpr'
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
      source: 'videofit',
      raw_payload: JSON.stringify(rawPayload),
      confidence: body.confidence ?? null,
      lane: body.lane ?? null,
      camera_id: body.camera_id ?? null,
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

    // Fetch potential matching bookings
    const { data: bookings, error: bookingError } = await supabase
      .from('bookings')
      .select('id, start_at, end_at, status, arrived_at, departed_at, ops_status, plate')
      .eq('tenant_id', tenantId)
      .ilike('plate', plateNorm)
      .lte('start_at', windowEnd.toISOString())
      .gte('end_at', windowStart.toISOString())
      .neq('status', 'cancelled')
      .order('start_at', { ascending: true });

    let bookingId: string | null = null;
    let result = 'deny';
    let reason: string | null = 'no booking match';
    const now = new Date().toISOString();

    if (!bookingError && bookings && bookings.length > 0) {
      // Choose closest booking based on direction
      let matchedBooking: typeof bookings[0] | null = null;

      if (body.direction === 'in') {
        // For IN: choose closest start_at
        matchedBooking = bookings.reduce((closest, booking) => {
          const bookingStart = new Date(booking.start_at);
          const diffCurrent = Math.abs(occurredAt.getTime() - bookingStart.getTime());
          if (!closest) return booking;
          const closestStart = new Date(closest.start_at);
          const diffClosest = Math.abs(occurredAt.getTime() - closestStart.getTime());
          return diffCurrent < diffClosest ? booking : closest;
        }, null as typeof bookings[0] | null);
      } else {
        // For OUT: choose closest end_at
        matchedBooking = bookings.reduce((closest, booking) => {
          const bookingEnd = new Date(booking.end_at);
          const diffCurrent = Math.abs(occurredAt.getTime() - bookingEnd.getTime());
          if (!closest) return booking;
          const closestEnd = new Date(closest.end_at);
          const diffClosest = Math.abs(occurredAt.getTime() - closestEnd.getTime());
          return diffCurrent < diffClosest ? booking : closest;
        }, null as typeof bookings[0] | null);
      }

      if (matchedBooking) {
        bookingId = matchedBooking.id;

        try {
          await applyBookingOccupancyAction({
            bookingId: matchedBooking.id,
            action: body.direction === 'in' ? 'arrived' : 'departed',
            source: 'anpr',
            eventAt: occurredAtIso,
            metadata: { provider: 'internal_capture' },
          });
          result = 'allow';
          reason = null;
        } catch (err) {
          console.error('[ANPR Capture] Occupancy action failed:', err);
        }
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


