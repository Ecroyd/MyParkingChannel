import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isCronRequest } from "@/lib/auth/apiGuards";
import { reprocessIngestEmailById } from "@/lib/ingest/reprocessIngestEmail";
import { markIngestFailure } from "@/lib/ingest/markIngestFailure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MIN_AGE_MS = 15 * 60 * 1000; // leave in-flight requests alone
const GIVE_UP_AGE_MS = 2 * 60 * 60 * 1000; // after this, mark failed so a human sees it
const LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_RETRIES_PER_RUN = 5;

/**
 * Cron: retry emails whose processing never finished (e.g. the ingest request timed out).
 * "Stuck" = still status 'received' AND (no ingest_email_parses row OR an attachment still
 * pending). Emails that finished but contained nothing bookable also stay 'received', but they
 * have a parse row and no pending files, so they are not retried.
 * Stuck for over 2h → marked failed (alert + shows in the failed-emails admin view).
 */
async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const now = Date.now();

  const { data: candidates, error } = await supabase
    .from("ingest_emails")
    .select("id, received_at, to_address, from_address, subject")
    .eq("status", "received")
    .lt("received_at", new Date(now - MIN_AGE_MS).toISOString())
    .gte("received_at", new Date(now - LOOKBACK_MS).toISOString())
    .order("received_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!candidates?.length) {
    return NextResponse.json({ ok: true, retried: 0, gaveUp: 0 });
  }

  const ids = candidates.map((c) => c.id);
  const [{ data: parses, error: parsesErr }, { data: pendingFiles, error: filesErr }] = await Promise.all([
    supabase.from("ingest_email_parses").select("ingest_email_id").in("ingest_email_id", ids),
    supabase.from("ingest_email_files").select("email_id").in("email_id", ids).eq("parse_status", "pending"),
  ]);
  if (parsesErr || filesErr) {
    return NextResponse.json(
      { ok: false, error: parsesErr?.message ?? filesErr?.message },
      { status: 500 }
    );
  }

  const hasParse = new Set((parses ?? []).map((p) => p.ingest_email_id));
  const hasPending = new Set((pendingFiles ?? []).map((f) => f.email_id));
  const stuck = candidates.filter((c) => !hasParse.has(c.id) || hasPending.has(c.id));

  let retried = 0;
  let gaveUp = 0;
  const results: Array<{ emailId: string; action: string; ok?: boolean; error?: string | null }> = [];

  for (const email of stuck) {
    const age = now - new Date(email.received_at).getTime();
    if (age > GIVE_UP_AGE_MS) {
      await markIngestFailure(supabase, {
        emailId: email.id,
        error: "Processing never completed (stuck for over 2 hours after automatic retries)",
        fromAddress: email.from_address ?? null,
        subject: email.subject ?? null,
        toAddress: email.to_address ?? null,
      });
      gaveUp++;
      results.push({ emailId: email.id, action: "marked_failed" });
      continue;
    }
    if (retried >= MAX_RETRIES_PER_RUN) continue;
    retried++;
    try {
      const r = await reprocessIngestEmailById(supabase, email.id);
      results.push({ emailId: email.id, action: "retried", ok: r.ok, error: r.error ?? null });
    } catch (e) {
      results.push({ emailId: email.id, action: "retried", ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ ok: true, stuck: stuck.length, retried, gaveUp, results });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
