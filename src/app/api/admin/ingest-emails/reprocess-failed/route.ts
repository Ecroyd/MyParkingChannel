import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/ingest/requireAdminApi";
import {
  reprocessIngestEmailById,
  reprocessIngestEmailsByReferences,
} from "@/lib/ingest/reprocessIngestEmail";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/ingest-emails/reprocess-failed
 * Body: { days?: number; errorContains?: string; references?: string[]; limit?: number }
 */
export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  let body: {
    days?: number;
    errorContains?: string;
    references?: string[];
    limit?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok
  }

  const supabase = getServiceSupabase();

  if (body.references?.length) {
    const results = await reprocessIngestEmailsByReferences(
      supabase,
      body.references.map((r) => String(r).trim().toUpperCase()).filter(Boolean)
    );
    return NextResponse.json({
      ok: results.every((r) => r.ok),
      mode: "references",
      attempted: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  }

  const days = Math.min(90, Math.max(1, body.days ?? 14));
  const errorContains = body.errorContains?.trim() || null;
  const limit = Math.min(200, Math.max(1, body.limit ?? 100));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("ingest_emails")
    .select("id, to_address, from_address, subject, message_id, raw_rfc822_base64")
    .eq("status", "failed")
    .gte("received_at", since)
    .order("received_at", { ascending: true })
    .limit(limit);

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
  const results: {
    emailId: string;
    ok: boolean;
    bookingId?: string | null;
    error?: string | null;
  }[] = [];

  for (const email of emails ?? []) {
    if (!email.raw_rfc822_base64) {
      failed++;
      failures.push({ emailId: email.id, error: "missing raw_rfc822_base64" });
      results.push({ emailId: email.id, ok: false, error: "missing raw_rfc822_base64" });
      continue;
    }

    const result = await reprocessIngestEmailById(supabase, email.id);
    results.push({ emailId: email.id, ...result });

    if (result.ok) {
      succeeded++;
    } else {
      failed++;
      failures.push({ emailId: email.id, error: result.error ?? "unknown error" });
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    mode: "failed_batch",
    attempted,
    succeeded,
    failed,
    failures,
    results,
    since,
    days,
    errorContains,
  });
}
