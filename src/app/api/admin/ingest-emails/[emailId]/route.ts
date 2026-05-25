import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { requireAdminApi } from "@/lib/ingest/requireAdminApi";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ingest-emails/:emailId — detail for admin UI (raw preserved, parse guesses).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  const { emailId } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
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
      message_id,
      raw_rfc822_base64,
      ingest_email_parses (
        parse_status,
        parse_error,
        parsed_subject,
        parsed_text,
        forwarded_text,
        booking_plate_guess,
        booking_reference_guess,
        parsed_at
      )
    `
    )
    .eq("id", emailId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  const hasRaw = Boolean(data.raw_rfc822_base64);
  return NextResponse.json({
    ok: true,
    email: {
      ...data,
      raw_rfc822_base64: hasRaw ? "[stored — use reprocess to parse]" : null,
      raw_present: hasRaw,
    },
  });
}
