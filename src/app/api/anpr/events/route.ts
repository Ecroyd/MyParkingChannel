import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const rows = events.map((e: any) => {
    const plateRaw = (e.plateRaw ?? e.plate ?? "").toString().trim();
    return {
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
