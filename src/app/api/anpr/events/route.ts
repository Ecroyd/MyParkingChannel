// POST /api/anpr/events - Ingest ANPR camera reads
// Authenticated via relay token (x-relay-token header)
// Uses same auth pattern as /api/internal/anpr/outbox (requireRelayAuth)
// Supports flexible payload formats (single event or array of events)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { requireRelayAuth } from "@/app/api/internal/anpr/_relayAuth";
import { getDirectionFromCameraId } from "@/lib/anpr/camera-mapping";

// Allow any extra keys forever (future-proof)
const EventSchema = z
  .object({
    id: z.string().optional(),

    plate: z.string().min(1).optional(),
    plateRaw: z.string().min(1).optional(),

    received_at: z.string().optional(),
    event_time: z.string().optional(),
    receivedAt: z.string().optional(),
    eventAt: z.string().optional(),

    sha1: z.string().optional(),
    bytes: z.number().optional(),
    remote: z.string().optional(),

    camera_id: z.string().nullable().optional(),
    cameraId: z.string().nullable().optional(),
    direction: z.string().optional(),

    sourceFile: z.string().nullable().optional(),
    sourcePath: z.string().nullable().optional(),
    source: z.string().optional(),

    tenantId: z.string().optional(),
    siteId: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
    snapshotUrl: z.string().nullable().optional(),
  })
  .passthrough();

const BodySchema = z.union([
  EventSchema,
  z.object({ events: z.array(EventSchema).min(1) }).passthrough(),
]);

function normalizePlate(p: string) {
  return p.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function pickEventAt(e: any) {
  return (
    e.eventAt ??
    e.event_time ??
    e.receivedAt ??
    e.received_at ??
    new Date().toISOString()
  );
}

function pickReceivedAt(e: any) {
  return e.receivedAt ?? e.received_at ?? new Date().toISOString();
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Extract events array or single event
  const events = Array.isArray((parsed.data as any).events)
    ? (parsed.data as any).events
    : [parsed.data];

  // Extract tenantId from first event (required for auth)
  const tenantId = events[0]?.tenantId;
  if (!tenantId) {
    return NextResponse.json(
      { error: "tenantId is required in request body" },
      { status: 400 }
    );
  }

  // Relay token auth check (same pattern as /api/internal/anpr/outbox)
  const auth = await requireRelayAuth(req, tenantId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createAdminClient();

  // Fetch tenant ANPR config for dedupe_seconds, grace windows, and camera mapping
  const { data: config } = await supabase
    .from("tenant_anpr_config")
    .select(
      "dedupe_seconds, arrival_grace_minutes, departure_grace_minutes, camera_direction_map"
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const dedupeSeconds = config?.dedupe_seconds ?? 60;
  const arrivalGraceMinutes = config?.arrival_grace_minutes ?? 240; // 4 hours default
  const departureGraceMinutes = config?.departure_grace_minutes ?? 480; // 8 hours default
  const cameraDirectionMap = config?.camera_direction_map ?? {};

  const insertedIds: string[] = [];
  const matchedIds: string[] = [];

  // Process each event
  for (const e of events) {
    const plateRaw = (e.plateRaw ?? e.plate ?? "").trim();
    if (!plateRaw) {
      continue; // Skip events without plates
    }

    const plateNorm = normalizePlate(plateRaw);
    const eventAtStr = pickEventAt(e);
    const receivedAtStr = pickReceivedAt(e);

    // Parse event timestamp
    const eventAtDate = new Date(eventAtStr);
    if (isNaN(eventAtDate.getTime())) {
      console.error(`[ANPR Events] Invalid eventAt timestamp: ${eventAtStr}`);
      continue; // Skip invalid timestamps
    }

    const cameraId = e.cameraId ?? e.camera_id ?? null;

    // Determine direction: use camera mapping if cameraId is provided, otherwise use provided direction
    let normalizedDirection: "in" | "out" | "unknown";
    if (cameraId && cameraDirectionMap) {
      // Use camera mapping to determine direction
      normalizedDirection = getDirectionFromCameraId(cameraId, cameraDirectionMap);
      // If mapping returns unknown, fall back to provided direction
      if (normalizedDirection === "unknown" && e.direction) {
        normalizedDirection =
          e.direction === "entry" || e.direction === "in"
            ? "in"
            : e.direction === "exit" || e.direction === "out"
            ? "out"
            : "unknown";
      }
    } else {
      // Use provided direction
      normalizedDirection =
        e.direction === "entry" || e.direction === "in"
          ? "in"
          : e.direction === "exit" || e.direction === "out"
          ? "out"
          : "unknown";
    }

    // Dedupe check: same tenant + same plate_normalized + same direction within dedupe_seconds
    const dedupeWindowStart = new Date(
      eventAtDate.getTime() - dedupeSeconds * 1000
    );
    const { data: existingEvent } = await supabase
      .from("anpr_events")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("plate_normalized", plateNorm)
      .eq("direction", normalizedDirection)
      .gte("event_at", dedupeWindowStart.toISOString())
      .lte("event_at", eventAtDate.toISOString())
      .order("event_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingEvent) {
      // Skip duplicate event
      continue;
    }

    // Insert new event
    const insertData: any = {
      tenant_id: tenantId,
      site_id: e.siteId ?? null,
      camera_id: cameraId,
      direction: normalizedDirection,
      event_at: eventAtDate.toISOString(),
      received_at: receivedAtStr,
      plate_raw: plateRaw,
      plate_normalized: plateNorm,
      confidence: e.confidence ?? null,
      snapshot_url: e.snapshotUrl ?? null,
      status: "unmatched",
    };

    // Store raw payload in notes field if available (for debugging)
    if (e.sourceFile || e.sourcePath || e.source) {
      insertData.notes = JSON.stringify({
        sourceFile: e.sourceFile,
        sourcePath: e.sourcePath,
        source: e.source,
        raw: e,
      });
    }

    const { data: newEvent, error: insertError } = await supabase
      .from("anpr_events")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError || !newEvent) {
      console.error("[ANPR Events] Insert error:", insertError);
      continue; // Skip failed inserts
    }

    insertedIds.push(newEvent.id);

    // Run matching logic
    let matchedBookingId: string | null = null;
    let matchStatus: "matched" | "unmatched" = "unmatched";

    if (normalizedDirection === "in" || normalizedDirection === "out") {
      // Find candidate bookings for this tenant + plate
      const { data: candidateBookings } = await supabase
        .from("bookings")
        .select(
          "id, plate, start_at, end_at, checked_in_at, checked_out_at, anpr_status"
        )
        .eq("tenant_id", tenantId)
        .neq("status", "cancelled")
        .order("start_at", { ascending: true });

      if (candidateBookings && candidateBookings.length > 0) {
        // Filter bookings by normalized plate match
        const matchingBookings = candidateBookings.filter((booking) => {
          const bookingPlateNormalized = normalizePlate(booking.plate || "");
          return bookingPlateNormalized === plateNorm;
        });

        // Find best match using grace windows
        let bestMatch: (typeof candidateBookings)[0] | null = null;

        for (const booking of matchingBookings) {
          const bookingStart = new Date(booking.start_at);
          const bookingEnd = new Date(booking.end_at);

          if (normalizedDirection === "in") {
            // For arrival: event_at should be within grace window around booking start
            const graceStart = new Date(
              bookingStart.getTime() - arrivalGraceMinutes * 60 * 1000
            );
            const graceEnd = new Date(
              bookingStart.getTime() + arrivalGraceMinutes * 60 * 1000
            );

            if (eventAtDate >= graceStart && eventAtDate <= graceEnd) {
              // Only match if booking hasn't already arrived
              if (!booking.checked_in_at) {
                bestMatch = booking;
                break; // Take first valid match
              }
            }
          } else if (normalizedDirection === "out") {
            // For departure: event_at should be after booking start and within grace window after booking end
            const graceEnd = new Date(
              bookingEnd.getTime() + departureGraceMinutes * 60 * 1000
            );

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
          matchStatus = "matched";
          matchedIds.push(newEvent.id);

          // Update booking based on direction
          const bookingUpdates: any = {};

          if (normalizedDirection === "in") {
            // Set arrival
            bookingUpdates.checked_in_at = eventAtDate.toISOString();
            bookingUpdates.anpr_status = "on_site";
            // Clear departure if it was set
            if (bestMatch.checked_out_at) {
              bookingUpdates.checked_out_at = null;
            }
          } else if (normalizedDirection === "out") {
            // Set departure
            bookingUpdates.checked_out_at = eventAtDate.toISOString();
            bookingUpdates.anpr_status = "departed";
            // Ensure checked_in_at is set if missing
            if (!bestMatch.checked_in_at) {
              bookingUpdates.checked_in_at = eventAtDate.toISOString();
            }
          }

          // Update booking
          await supabase
            .from("bookings")
            .update(bookingUpdates)
            .eq("id", bestMatch.id)
            .eq("tenant_id", tenantId);

          // Update event status
          await supabase
            .from("anpr_events")
            .update({
              status: "matched",
              booking_id: matchedBookingId,
            })
            .eq("id", newEvent.id);
        }
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      inserted: insertedIds.length,
      matched: matchedIds.length,
      insertedIds,
      matchedIds,
    },
    { status: 200 }
  );
}
