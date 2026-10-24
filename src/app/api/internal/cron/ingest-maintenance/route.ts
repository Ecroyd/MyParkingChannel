import { NextRequest, NextResponse } from "next/server";
import { isCronRequest } from "@/lib/auth/apiGuards";
import { GET as runParseReceived } from "../parse-received/route";
import { GET as runIngestRetry } from "../ingest-retry/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron entry for email-ingest housekeeping (every 15 minutes):
 *   1. parse-received  – backfill parse previews for received emails
 *   2. ingest-retry    – re-run emails whose processing never finished
 * Ingest canary is a separate cron (twice daily) so it does not burn Resend
 * quota every 15 minutes. Each step is isolated; individual routes still exist
 * for manual runs.
 */
const STEPS = [
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
