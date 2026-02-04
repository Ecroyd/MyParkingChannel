import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server-admin";

const EventSchema = z
  .object({
    plate: z.string().optional(),
    plateRaw: z.string().optional(),
    received_at: z.string().optional(),
    event_time: z.string().optional(),
    sha1: z.string().optional(),
    bytes: z.number().optional(),
    remote: z.string().optional(),
    camera_id: z.any().optional(),
    direction: z.any().optional(),
    id: z.string().optional(),
  })
  .passthrough();

const BodySchema = z.union([
  EventSchema,
  z.object({ events: z.array(EventSchema).min(1) }).passthrough(),
]);

function normalizePlate(p: string) {
  return p.replace(/\s+/g, "").toUpperCase();
}

function pickEventAt(e: any) {
  return e.eventAt ?? e.event_time ?? e.received_at ?? new Date().toISOString();
}

export async function POST(req: NextRequest) {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    console.error("[ANPR EVENTS] Supabase not configured:", e);
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 }
    );
  }

  const text = await req.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", received: text.slice(0, 500) },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten(), received: json },
      { status: 400 }
    );
  }

  const events = Array.isArray((parsed.data as any).events)
    ? (parsed.data as any).events
    : [parsed.data];

  // Validate tenant_id is present on all events
  for (const e of events) {
    if (!(e as any).tenant_id && !(e as any).tenantId) {
      return NextResponse.json(
        { error: "Missing tenant_id on event", received: e },
        { status: 400 }
      );
    }
  }

  const rows = events.map((e: any) => {
    const plateRaw = (e.plateRaw ?? e.plate ?? "").toString().trim();
    return {
      tenant_id: e.tenant_id ?? e.tenantId ?? null,
      plate_raw: plateRaw || null,
      plate_normalized: plateRaw ? normalizePlate(plateRaw) : null,
      event_at: pickEventAt(e),
      received_at: e.received_at ?? new Date().toISOString(),
      camera_id: e.cameraId ?? e.camera_id ?? null,
      direction: e.direction ?? "unknown",
      sha1: e.sha1 ?? null,
      raw: e,
    };
  });

  const { error } = await supabase.from("anpr_events").insert(rows);
  if (error) {
    return NextResponse.json({ error: "DB insert failed", details: error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: rows.length }, { status: 200 });
}
