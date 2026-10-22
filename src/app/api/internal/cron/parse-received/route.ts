import { NextRequest, NextResponse } from "next/server";
import { runParseReceived } from "@/lib/ingest/runParseReceived";
import { isCronRequest } from "@/lib/auth/apiGuards";

// Parsing/sync can take a while; allow up to 5 minutes (Vercel Pro).
export const maxDuration = 300;

export const runtime = "nodejs";

/**
 * Cron: backfill ingest_email_parses for received emails that don't have a parse row yet.
 * Auth: Authorization: Bearer INTERNAL_CRON_KEY or x-internal-cron-key header.
 * Schedule e.g. every 5–15 min so any missed parses get filled.
 */
export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}

async function handleCron(req: NextRequest) {
  // Accepts Bearer INTERNAL_CRON_KEY / CRON_SECRET (Vercel Cron), x-internal-cron-key or JOB_SECRET.
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, reason: "invalid token" }, { status: 401 });
  }

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "25", 10) || 25,
    100
  );
  const { parsedCount, error } = await runParseReceived(limit);
  if (error) {
    return NextResponse.json({ ok: false, parsedCount: 0, error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, parsedCount });
}
