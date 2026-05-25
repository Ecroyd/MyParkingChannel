import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/ingest/requireAdminApi";
import { processIngestEmail } from "@/lib/ingest/processIngestEmail";
import { clearIngestEmailForReprocess } from "@/lib/ingest/markIngestFailure";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/ingest-emails/reprocess-failed
 * Body: { days?: number, errorContains?: string }
 */
export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  let body: { days?: number; errorContains?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok
  }

  const days = Math.min(90, Math.max(1, body.days ?? 14));
  const errorContains = body.errorContains?.trim() || null;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = getServiceSupabase();
  let query = supabase
    .from("ingest_emails")
    .select("id, to_address, from_address, subject, message_id, raw_rfc822_base64")
    .eq("status", "failed")
    .gte("received_at", since)
    .order("received_at", { ascending: true })
    .limit(100);

  if (errorContains) {
    query = query.ilike("error", `%${errorContains}%`);
  }

  const { data: emails, error: listErr } = await query;

  if (listErr) {
    return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });
  }

  const attempted = emails?.length ?? 0;
  let succeeded = 0;
  let failed = 0;
  const failures: { emailId: string; error: string }[] = [];

  for (const email of emails ?? []) {
    if (!email.raw_rfc822_base64) {
      failed++;
      failures.push({ emailId: email.id, error: "missing raw_rfc822_base64" });
      continue;
    }

    await clearIngestEmailForReprocess(supabase, email.id);
    const result = await processIngestEmail(supabase, {
      emailId: email.id,
      raw_rfc822_base64: email.raw_rfc822_base64,
      to_address: email.to_address,
      from_address: email.from_address,
      subject: email.subject,
      message_id: email.message_id,
    });

    if (result.ok) {
      succeeded++;
    } else {
      failed++;
      failures.push({ emailId: email.id, error: result.error ?? "unknown error" });
    }
  }

  return NextResponse.json({
    ok: true,
    attempted,
    succeeded,
    failed,
    failures,
    since,
    days,
    errorContains,
  });
}
