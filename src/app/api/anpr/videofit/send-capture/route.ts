// POST /api/anpr/videofit/send-capture
// SOAP endpoint for Videofit SendCapture Web Service
// Authenticated via x-videofit-token header

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { assertVideofitIngestAuth } from '@/lib/anpr/videofit-auth';
import {
  parseSoapSendCapture,
  ticksToDate,
  generateCameraId,
} from '@/lib/anpr/videofit-utils';
import { getDirectionForVideofit } from '@/lib/anpr/camera-mapping';
import { applyBookingOccupancyAction } from '@/lib/ops/occupancyAction';

/**
 * Normalize plate: uppercase, remove non-alphanumeric
 */
function normalizePlateForEvent(plate: string): string {
  return plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    // Read raw body as text (SOAP is XML)
    const xmlBody = await req.text();

    if (!xmlBody || xmlBody.trim().length === 0) {
      return NextResponse.json(
        { error: 'Empty request body' },
        { status: 400 }
      );
    }

    // Parse SOAP XML to extract SendCapture fields
    let soapData;
    try {
      soapData = parseSoapSendCapture(xmlBody);
    } catch (parseError: any) {
      console.error('[Videofit SendCapture] SOAP parse error:', parseError);
      return NextResponse.json(
        { error: `Failed to parse SOAP body: ${parseError.message}` },
        { status: 400 }
      );
    }

    const {
      siteClientLicense,
      time: ticks,
      locSite,
      locPc,
      locPcNo,
      locCameraNo,
      locCamera,
      vehPlate,
      vehGroup,
    } = soapData;

    // Validate required fields
    if (!vehPlate || !ticks) {
      return NextResponse.json(
        { error: 'Missing required fields: vehPlate and time are required' },
        { status: 400 }
      );
    }

    // Convert .NET ticks to ISO timestamp
    let eventAtDate: Date;
    try {
      eventAtDate = ticksToDate(ticks);
    } catch (tickError: any) {
      console.error('[Videofit SendCapture] Ticks conversion error:', tickError);
      return NextResponse.json(
        { error: `Invalid time ticks: ${tickError.message}` },
        { status: 400 }
      );
    }

    // Determine tenantId from siteClientLicense
    // We need to find which tenant this siteClientLicense belongs to
    const supabase = createAdminClient();

    // Try to find tenant by matching siteClientLicense in tenant_anpr_config or anpr_sites
    // First, try anpr_sites (if siteClientLicense matches)
    const { data: anprSite } = await supabase
      .from('anpr_sites')
      .select('tenant_id')
      .eq('site_client_license', siteClientLicense)
      .maybeSingle();

    let tenantId: string | null = null;

    if (anprSite) {
      tenantId = anprSite.tenant_id;
    } else {
      // Fallback: try tenant_anpr_config
      const { data: config } = await supabase
        .from('tenant_anpr_config')
        .select('tenant_id')
        .eq('videofit_site_client_license', siteClientLicense)
        .maybeSingle();

      if (config) {
        tenantId = config.tenant_id;
      }
    }

    // If still no tenant, try to get from header or use a default lookup
    // For now, we'll require tenantId to be determinable from siteClientLicense
    // OR we can add tenantId as a query param or header
    const tenantIdFromQuery = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId && tenantIdFromQuery) {
      tenantId = tenantIdFromQuery;
    }

    if (!tenantId) {
      console.error('[Videofit SendCapture] Cannot determine tenantId from siteClientLicense:', siteClientLicense);
      return NextResponse.json(
        { error: 'Cannot determine tenant from siteClientLicense. Please provide tenantId in query parameter or configure siteClientLicense mapping.' },
        { status: 400 }
      );
    }

    // Authenticate via videofit ingest token
    try {
      await assertVideofitIngestAuth(req, tenantId);
    } catch (authError) {
      if (authError instanceof Response) {
        return authError;
      }
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Fetch tenant ANPR config for dedupe_seconds, grace windows, and camera mapping
    const { data: config } = await supabase
      .from('tenant_anpr_config')
      .select('dedupe_seconds, arrival_grace_minutes, departure_grace_minutes, camera_direction_map')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const dedupeSeconds = config?.dedupe_seconds ?? 60;
    const arrivalGraceMinutes = config?.arrival_grace_minutes ?? 240;
    const departureGraceMinutes = config?.departure_grace_minutes ?? 480;
    const cameraDirectionMap = config?.camera_direction_map ?? {};

    // Normalize plate
    const plateNormalized = normalizePlateForEvent(vehPlate);
    const plateRawValue = vehPlate.trim();

    // Generate cameraId first
    const cameraId = generateCameraId(locPcNo, locCameraNo, locPc, locCamera);

    // Determine direction from camera mapping (using cameraId and locCameraNo for backward compatibility)
    const direction = getDirectionForVideofit(cameraId, locCameraNo, cameraDirectionMap);

    // Dedupe check: same tenant + same plate_normalized + same direction within dedupe_seconds
    const dedupeWindowStart = new Date(eventAtDate.getTime() - dedupeSeconds * 1000);
    const { data: existingEvent } = await supabase
      .from('anpr_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('plate_normalized', plateNormalized)
      .eq('direction', direction)
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

    // Find site_id from anpr_sites if available
    let siteId: string | null = null;
    if (siteClientLicense) {
      const { data: site } = await supabase
        .from('anpr_sites')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('site_client_license', siteClientLicense)
        .maybeSingle();
      if (site) {
        siteId = site.id;
      }
    }

    // Insert new event
    const { data: newEvent, error: insertError } = await supabase
      .from('anpr_events')
      .insert({
        tenant_id: tenantId,
        site_id: siteId || null,
        camera_id: cameraId,
        direction: direction,
        event_at: eventAtDate.toISOString(),
        plate_raw: plateRawValue,
        plate_normalized: plateNormalized,
        confidence: null, // Videofit doesn't provide confidence in SendCapture
        snapshot_url: null, // Images handled separately if needed
        status: 'unmatched',
      })
      .select('id')
      .single();

    if (insertError || !newEvent) {
      console.error('[Videofit SendCapture] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create event' },
        { status: 500 }
      );
    }

    // Run matching logic (same as /api/anpr/events)
    let matchedBookingId: string | null = null;
    let matchStatus: 'matched' | 'unmatched' = 'unmatched';

    if (direction === 'in' || direction === 'out') {
      // Find candidate bookings for this tenant + plate
      const { data: candidateBookings } = await supabase
        .from('bookings')
        .select('id, plate, start_at, end_at, checked_in_at, checked_out_at, arrived_at, departed_at, anpr_status')
        .eq('tenant_id', tenantId)
        .neq('status', 'cancelled')
        .order('start_at', { ascending: true });

      if (candidateBookings && candidateBookings.length > 0) {
        // Filter bookings by normalized plate match
        const matchingBookings = candidateBookings.filter((booking) => {
          const bookingPlateNormalized = normalizePlateForEvent(booking.plate || '');
          return bookingPlateNormalized === plateNormalized;
        });

        // Find best match using grace windows
        let bestMatch: typeof candidateBookings[0] | null = null;

        for (const booking of matchingBookings) {
          const bookingStart = new Date(booking.start_at);
          const bookingEnd = new Date(booking.end_at);

          if (direction === 'in') {
            // For arrival: event_at should be within grace window around booking start
            const graceStart = new Date(bookingStart.getTime() - arrivalGraceMinutes * 60 * 1000);
            const graceEnd = new Date(bookingStart.getTime() + arrivalGraceMinutes * 60 * 1000);

            if (eventAtDate >= graceStart && eventAtDate <= graceEnd) {
              // Only match if booking hasn't already arrived
              if (!booking.checked_in_at) {
                bestMatch = booking;
                break;
              }
            }
          } else if (direction === 'out') {
            // For departure: event_at should be after booking start and within grace window after booking end
            const graceEnd = new Date(bookingEnd.getTime() + departureGraceMinutes * 60 * 1000);

            if (eventAtDate >= bookingStart && eventAtDate <= graceEnd) {
              // Only match if booking is on_site (checked_in_at set, checked_out_at null)
              if (booking.checked_in_at && !booking.checked_out_at) {
                bestMatch = booking;
                break;
              }
            }
          }
        }

        if (bestMatch) {
          matchedBookingId = bestMatch.id;
          matchStatus = 'matched';

          // Occupancy ledger + booking state (idempotent)
          if (direction === 'in') {
            await applyBookingOccupancyAction({
              bookingId: bestMatch.id,
              action: 'arrived',
              source: 'anpr',
              eventAt: eventAtDate.toISOString(),
              metadata: { provider: 'videofit', anprEventId: newEvent.id },
            });
          } else if (direction === 'out') {
            await applyBookingOccupancyAction({
              bookingId: bestMatch.id,
              action: 'departed',
              source: 'anpr',
              eventAt: eventAtDate.toISOString(),
              metadata: { provider: 'videofit', anprEventId: newEvent.id },
            });
          }

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

    // Return SOAP response (Videofit expects SOAP response)
    const soapResponse = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <sendCaptureResponse xmlns="http://tempuri.org/">
      <sendCaptureResult>true</sendCaptureResult>
      <eventId>${newEvent.id}</eventId>
      <status>${matchStatus}</status>
      <bookingId>${matchedBookingId || ''}</bookingId>
    </sendCaptureResponse>
  </soap:Body>
</soap:Envelope>`;

    return new NextResponse(soapResponse, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.error('[Videofit SendCapture] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
