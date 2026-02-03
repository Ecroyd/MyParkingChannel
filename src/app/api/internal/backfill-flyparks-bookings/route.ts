import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { upsertBookingFromFlyparksParse } from "@/lib/ingest/flyparksBookingUpsert";

/**
 * One-off internal route: backfill bookings from existing ingest_email_parses (Flyparks).
 * Re-extracts fields (including amount) and upserts bookings. Same logic as live ingest + script.
 *
 * Auth: Authorization: Bearer INTERNAL_CRON_KEY (or x-internal-cron-key)
 * POST /api/internal/backfill-flyparks-bookings
 */
export async function POST(req: NextRequest) {
  try {
    const envKey = process.env.INTERNAL_CRON_KEY?.trim();
    const auth = req.headers.get("authorization") ?? "";
    const xKey = req.headers.get("x-internal-cron-key")?.trim() ?? "";

    if (!envKey) {
      return NextResponse.json({ ok: false, error: "INTERNAL_CRON_KEY not configured" }, { status: 500 });
    }

    const m = auth.match(/^Bearer\s+(.+)$/i);
    const bearerToken = m ? m[1].trim() : "";
    const valid = bearerToken === envKey || xKey === envKey;
    if (!valid) {
      return NextResponse.json({ ok: false, reason: "invalid token" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    const { data: parses, error: parseErr } = await supabase
      .from("ingest_email_parses")
      .select(
        `
        id,
        forwarded_text,
        booking_plate_guess,
        booking_reference_guess,
        ingest_emails ( id, to_address )
      `
      )
      .not("booking_reference_guess", "is", null)
      .not("forwarded_text", "is", null);

    if (parseErr) {
      return NextResponse.json({ ok: false, error: parseErr.message }, { status: 500 });
    }

    const rows = parses ?? [];
    let upserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of rows) {
      const email = Array.isArray(row.ingest_emails) ? row.ingest_emails[0] : row.ingest_emails;
      const toAddress = (email as { to_address?: string } | null)?.to_address ?? null;

      if (!toAddress) {
        skipped++;
        continue;
      }

      const { data: inboxRow, error: inboxErr } = await supabase
        .from("tenant_inbound_inboxes")
        .select("tenant_id")
        .eq("to_address", toAddress)
        .maybeSingle();

      if (inboxErr || !inboxRow?.tenant_id) {
        skipped++;
        continue;
      }

      const result = await upsertBookingFromFlyparksParse(supabase, {
        tenantId: inboxRow.tenant_id,
        reference: String(row.booking_reference_guess),
        plate: row.booking_plate_guess ?? null,
        forwardedText: row.forwarded_text ?? "",
      });

      if (result.ok) upserted++;
      else errors++;
    }

    return NextResponse.json({
      ok: true,
      parsed: rows.length,
      upserted,
      skipped,
      errors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
