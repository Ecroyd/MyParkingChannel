import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { requireAdminApi } from "@/lib/ingest/requireAdminApi";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ingest-emails/failed
 * List failed ingest emails (default: last 14 days).
 */
export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") ?? "14", 10) || 14));
  const errorContains = url.searchParams.get("errorContains")?.trim() || null;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();
  let query = supabase
    .from("ingest_emails")
    .select(
      `
      id,
      received_at,
      created_at,
      from_address,
      to_address,
      subject,
      status,
      error,
      ingest_email_parses (
        parse_status,
        parse_error,
        parsed_at,
        booking_plate_guess,
        booking_reference_guess,
        forwarded_text
      )
    `
    )
    .eq("status", "failed")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(200);

  if (errorContains) {
    query = query.ilike("error", `%${errorContains}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const emails = (data ?? []).map((row: Record<string, unknown>) => {
    const parses = row.ingest_email_parses as
      | Array<Record<string, unknown>>
      | Record<string, unknown>
      | null;
    const parseList = Array.isArray(parses) ? parses : parses ? [parses] : [];
    const latest = parseList[0] ?? null;
    return {
      id: row.id,
      received_at: row.received_at ?? row.created_at,
      from_address: row.from_address,
      to_address: row.to_address,
      subject: row.subject,
      status: row.status,
      error: row.error,
      latest_parse_status: latest?.parse_status ?? null,
      latest_parse_error: latest?.parse_error ?? null,
      booking_plate_guess: latest?.booking_plate_guess ?? null,
      booking_reference_guess: latest?.booking_reference_guess ?? null,
    };
  });

  return NextResponse.json({ ok: true, emails, since, days });
}
