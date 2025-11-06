import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Vendors should include ?tenantId=... or a header for routing
export async function POST(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    const payload = await req.json().catch(() => ({}));

    // Map vendor fields -> normalized record
    const event_type = normalizeType(payload); // ENTRY | EXIT | ERROR
    const plate = (payload.plate ?? payload.license ?? payload.registration ?? "").toString().toUpperCase() || null;
    const confidence = typeof payload.confidence === "number" ? payload.confidence : null;
    const reason = payload.error || payload.reason || payload.message || null;
    const event_ts = payload.timestamp
      ? new Date(payload.timestamp).toISOString()
      : payload.event_at
      ? new Date(payload.event_at).toISOString()
      : new Date().toISOString();

    const adminClient = createAdminClient();

    // Insert into gate_events table
    // Match the structure used in existing anpr/route.ts
    const gateEventData: any = {
      tenant_id: tenantId,
      event_at: event_ts,
      mode: event_type === "ENTRY" ? "entry" : event_type === "EXIT" ? "exit" : "anpr",
      plate: plate,
      result: event_type === "ERROR" ? "error" : confidence && confidence < 0.7 ? "failed" : "success",
      reason: reason,
    };

    // Add meta if the column exists (JSONB for full payload)
    // Try to include it, but don't fail if column doesn't exist
    try {
      gateEventData.meta = payload;
    } catch {
      // meta column might not exist, that's okay
    }

    const { error } = await adminClient.from("gate_events").insert(gateEventData);

    if (error) {
      console.error("Error inserting gate event:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in ANPR webhook:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

function normalizeType(p: any): "ENTRY" | "EXIT" | "ERROR" {
  const t = (p.event || p.type || p.direction || "").toString().toUpperCase();
  if (["ENTRY", "ENTER", "IN", "ARRIVAL"].includes(t)) return "ENTRY";
  if (["EXIT", "LEAVE", "OUT", "DEPARTURE"].includes(t)) return "EXIT";
  if (t === "ERROR" || t === "FAILED" || t === "FAILURE") return "ERROR";
  // Heuristics: missing plate and gate sensor -> ERROR
  if (!p.plate && !p.license && !p.registration && p.gate) return "ERROR";
  // Default to ENTRY if unclear
  return "ENTRY";
}

