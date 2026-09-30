import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { requireAdminApi } from "@/lib/ingest/requireAdminApi";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ingest-emails/recent
 * Recent inbound emails to bookings@ (any status) so ops can see mail that landed
 * without a failure — previously only /failed was exposed in the admin UI.
 */
export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const days = Math.min(30, Math.max(1, parseInt(url.searchParams.get("days") ?? "7", 10) || 7));
  const status = url.searchParams.get("status")?.trim().toLowerCase() || null;
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
        booking_reference_guess
      ),
      ingest_email_files (
        id,
        filename,
        parse_status,
        parse_outcome,
        parse_error,
        detected_source
      )
    `
    )
    .ilike("to_address", "%bookings@myparkingchannel.app%")
    .gte("received_at", since)
    .order("received_at", { ascending: false })
    .limit(150);

  if (status && ["received", "parsed", "failed"].includes(status)) {
    query = query.eq("status", status);
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
    const files = (row.ingest_email_files as Array<Record<string, unknown>> | null) ?? [];
    const bookingFiles = files.filter((f) => f.parse_outcome !== "skipped");
    const filesParsedOk = bookingFiles.filter(
      (f) => f.parse_status === "parsed" && (f.parse_outcome === "parsed" || f.parse_outcome === "empty")
    ).length;
    const filesFailed = bookingFiles.filter(
      (f) => f.parse_status === "failed" || f.parse_outcome === "failed"
    ).length;

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
      file_count: files.length,
      booking_file_count: bookingFiles.length,
      files_parsed_ok: filesParsedOk,
      files_failed: filesFailed,
      detected_sources: [
        ...new Set(
          bookingFiles
            .map((f) => f.detected_source)
            .filter((s): s is string => typeof s === "string" && s.length > 0)
        ),
      ],
    };
  });

  return NextResponse.json({ ok: true, emails, since, days });
}
