import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/ingest/requireAdminApi";
import { processIngestEmail } from "@/lib/ingest/processIngestEmail";
import { clearIngestEmailForReprocess } from "@/lib/ingest/markIngestFailure";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/ingest-emails/reprocess
 * Body: { emailId: "uuid" }
 */
export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  let body: { emailId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const emailId = body?.emailId;
  if (!emailId) {
    return NextResponse.json({ ok: false, error: "missing emailId" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: email, error: emailErr } = await supabase
    .from("ingest_emails")
    .select("id, to_address, from_address, subject, message_id, raw_rfc822_base64")
    .eq("id", emailId)
    .single();

  if (emailErr || !email) {
    return NextResponse.json(
      { ok: false, error: emailErr?.message ?? "email not found" },
      { status: 404 }
    );
  }

  if (!email.raw_rfc822_base64) {
    return NextResponse.json({ ok: false, error: "email has no raw_rfc822_base64" }, { status: 400 });
  }

  await clearIngestEmailForReprocess(supabase, emailId);

  const result = await processIngestEmail(supabase, {
    emailId: email.id,
    raw_rfc822_base64: email.raw_rfc822_base64,
    to_address: email.to_address,
    from_address: email.from_address,
    subject: email.subject,
    message_id: email.message_id,
  });

  return NextResponse.json({
    ok: result.ok,
    emailId,
    error: result.error ?? null,
    bookingId: result.bookingId ?? null,
    textPromoted: result.textPromoted ?? false,
    fileIds: result.fileIds ?? [],
  });
}
