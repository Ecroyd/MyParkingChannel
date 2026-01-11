// POST /api/anpr/events - Ingest ANPR camera reads
// Authenticated via relay token (x-relay-token header)
// Uses same auth pattern as /api/internal/anpr/outbox (requireRelayAuth)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRelayAuth } from '@/app/api/internal/anpr/_relayAuth';
import { getDirectionFromCameraId } from '@/lib/anpr/camera-mapping';

/**
 * Normalize plate: uppercase, remove non-alphanumeric
 */
function normalizePlate(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json();
    const {
      tenantId,
      siteId,
      cameraId,
      direction,
      eventAt,
      plateRaw,
      confidence,
      snapshotUrl,
    } = body;

    // Validate required fields
    if (!tenantId) {
      return NextResponse.json(
        { error: 'tenantId is required in request body' },
        { status: 400 }
      );
    }

    if (!plateRaw || !eventAt) {
      return NextResponse.json(
        { error: 'plateRaw and eventAt are required' },
        { status: 400 }
      );
    }

    // Relay token auth check (same pattern as /api/internal/anpr/outbox)
    const auth = await requireRelayAuth(req, tenantId);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = createAdminClient();

    // Normalize plate
    const plateNormalized = normalizePlate(plateRaw);
    const plateRawValue = plateRaw.trim();

    // Parse event timestamp
    const eventAtDate = new Date(eventAt);
    if (isNaN(eventAtDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid eventAt timestamp (must be ISO 8601 format)' },
        { status: 400 }
      );
    }

    // Fetch tenant ANPR config for dedupe_seconds, grace windows, and camera mapping
    const { data: config } = await supabase
      .from('tenant_anpr_config')
      .select('dedupe_seconds, arrival_grace_minutes, departure_grace_minutes, camera_direction_map')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const dedupeSeconds = config?.dedupe_seconds ?? 60;
    const arrivalGraceMinutes = config?.arrival_grace_minutes ?? 240; // 4 hours default
    const departureGraceMinutes = config?.departure_grace_minutes ?? 480; // 8 hours default
    const cameraDirectionMap = config?.camera_direction_map ?? {};

    // Determine direction: use camera mapping if cameraId is provided, otherwise use provided direction
    let normalizedDirection: 'in' | 'out' | 'unknown';
    if (cameraId && cameraDirectionMap) {
      // Use camera mapping to determine direction
      normalizedDirection = getDirectionFromCameraId(cameraId, cameraDirectionMap);
      // If mapping returns unknown, fall back to provided direction
      if (normalizedDirection === 'unknown' && direction) {
        normalizedDirection = direction === 'entry' || direction === 'in' 
          ? 'in' 
          : direction === 'exit' || direction === 'out' 
          ? 'out' 
          : 'unknown';
      }
    } else {
      // Use provided direction
      normalizedDirection = direction === 'entry' || direction === 'in' 
        ? 'in' 
        : direction === 'exit' || direction === 'out' 
        ? 'out' 
        : 'unknown';
    }

    // Dedupe check: same tenant + same plate_normalized + same direction within dedupe_seconds
    const dedupeWindowStart = new Date(eventAtDate.getTime() - dedupeSeconds * 1000);
    const { data: existingEvent } = await supabase
      .from('anpr_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('plate_normalized', plateNormalized)
      .eq('direction', normalizedDirection)
      .gte('event_at', dedupeWindowStart.toISOString())
      .lte('event_at', eventAtDate.toISOString())
      .order('event_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingEvent) {
      // Return existing event ID (deduped)
      return NextResponse.json({
        id: existingEvent.id,
        status: 'deduped',
        message: 'Event already exists within deduplication window',
      });
    }

    // Insert new event
    const { data: newEvent, error: insertError } = await supabase
      .from('anpr_events')
      .insert({
        tenant_id: tenantId,
        site_id: siteId || null,
        camera_id: cameraId || null,
        direction: normalizedDirection,
        event_at: eventAtDate.toISOString(),
        plate_raw: plateRawValue,
        plate_normalized: plateNormalized,
        confidence: confidence ?? null,
        snapshot_url: snapshotUrl || null,
        status: 'unmatched',
      })
      .select('id')
      .single();

    if (insertError || !newEvent) {
      console.error('[ANPR Events] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create event' },
        { status: 500 }
      );
    }

    // Run matching logic
    let matchedBookingId: string | null = null;
    let matchStatus: 'matched' | 'unmatched' = 'unmatched';

    if (normalizedDirection === 'in' || normalizedDirection === 'out') {
      // Find candidate bookings for this tenant + plate
      // Note: We fetch all bookings and filter by normalized plate in code
      // because Supabase doesn't support case-insensitive regex matching
      const { data: candidateBookings } = await supabase
        .from('bookings')
        .select('id, plate, start_at, end_at, checked_in_at, checked_out_at, anpr_status')
        .eq('tenant_id', tenantId)
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true });

      if (candidateBookings && candidateBookings.length > 0) {
        // Filter bookings by normalized plate match
        const matchingBookings = candidateBookings.filter((booking) => {
          const bookingPlateNormalized = normalizePlate(booking.plate || '');
          return bookingPlateNormalized === plateNormalized;
        });

        // Find best match using grace windows
        let bestMatch: typeof candidateBookings[0] | null = null;

        for (const booking of matchingBookings) {
          const bookingStart = new Date(booking.start_at);
          const bookingEnd = new Date(booking.end_at);

          if (normalizedDirection === 'in') {
            // For arrival: event_at should be within grace window around booking start
            const graceStart = new Date(bookingStart.getTime() - arrivalGraceMinutes * 60 * 1000);
            const graceEnd = new Date(bookingStart.getTime() + arrivalGraceMinutes * 60 * 1000);

            if (eventAtDate >= graceStart && eventAtDate <= graceEnd) {
              // Only match if booking hasn't already arrived
              if (!booking.checked_in_at) {
                bestMatch = booking;
                break; // Take first valid match
              }
            }
          } else if (normalizedDirection === 'out') {
            // For departure: event_at should be after booking start and within grace window after booking end
            const graceEnd = new Date(bookingEnd.getTime() + departureGraceMinutes * 60 * 1000);

            if (eventAtDate >= bookingStart && eventAtDate <= graceEnd) {
              // Only match if booking is on_site (checked_in_at set, checked_out_at null)
              if (booking.checked_in_at && !booking.checked_out_at) {
                bestMatch = booking;
                break; // Take first valid match
              }
            }
          }
        }

        if (bestMatch) {
          matchedBookingId = bestMatch.id;
          matchStatus = 'matched';

          // Update booking based on direction
          const bookingUpdates: any = {};

          if (normalizedDirection === 'in') {
            // Set arrival
            bookingUpdates.checked_in_at = eventAtDate.toISOString();
            bookingUpdates.anpr_status = 'on_site';
            // Clear departure if it was set
            if (bestMatch.checked_out_at) {
              bookingUpdates.checked_out_at = null;
            }
          } else if (normalizedDirection === 'out') {
            // Set departure
            bookingUpdates.checked_out_at = eventAtDate.toISOString();
            bookingUpdates.anpr_status = 'departed';
            // Ensure checked_in_at is set if missing
            if (!bestMatch.checked_in_at) {
              bookingUpdates.checked_in_at = eventAtDate.toISOString();
            }
          }

          // Update booking
          await supabase
            .from('bookings')
            .update(bookingUpdates)
            .eq('id', bestMatch.id)
            .eq('tenant_id', tenantId);

          // Update event status
          await supabase
            .from('anpr_events')
            .update({
              status: 'matched',
              booking_id: matchedBookingId,
            })
            .eq('id', newEvent.id);
        }
      }
    }

    return NextResponse.json({
      id: newEvent.id,
      status: matchStatus,
      booking_id: matchedBookingId,
      plate_normalized: plateNormalized,
    });
  } catch (error: any) {
    console.error('[ANPR Events] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

