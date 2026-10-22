import { NextRequest, NextResponse } from "next/server";
import { isCronRequest } from "@/lib/auth/apiGuards";
import { GET as runIngestCanary } from "../ingest-canary/route";
import { GET as runParseReceived } from "../parse-received/route";
import { GET as runIngestRetry } from "../ingest-retry/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One Vercel Cron entry for the email-ingest housekeeping jobs, run in sequence:
 *   1. ingest-canary   – check the last canary arrived, send the next one
 *   2. parse-received  – backfill parse previews for received emails
 *   3. ingest-retry    – re-run emails whose processing never finished
 * Each step is isolated: one failing does not stop the others. The individual routes
 * still exist for manual runs and for any external scheduler during migration.
 */
const STEPS = [
  ["ingest-canary", runIngestCanary],
  ["parse-received", runParseReceived],
  ["ingest-retry", runIngestRetry],
] as const;

async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const results: Record<string, { status: number; ms: number; body?: unknown; error?: string }> = {};
  for (const [name, run] of STEPS) {
    const started = Date.now();
    try {
      const res = await run(req);
      results[name] = {
        status: res.status,
        ms: Date.now() - started,
        body: await res.json().catch(() => undefined),
      };
    } catch (e) {
      console.error(`[ingest-maintenance] ${name} threw`, e);
      results[name] = { status: 500, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const ok = Object.values(results).every((r) => r.status < 400);
  // Non-2xx when any step failed, so it shows as a failed run in Vercel's cron logs.
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
