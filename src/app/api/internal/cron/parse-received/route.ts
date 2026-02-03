import { NextRequest, NextResponse } from "next/server";
import { runParseReceived } from "@/lib/ingest/runParseReceived";

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
  const envKey = process.env.INTERNAL_CRON_KEY?.trim();
  const auth = req.headers.get("authorization") ?? "";
  const xKey = req.headers.get("x-internal-cron-key")?.trim() ?? "";

  if (!envKey) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_CRON_KEY not configured" },
      { status: 500 }
    );
  }

  let bearerToken = "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) bearerToken = m[1].trim();
  const valid = bearerToken === envKey || xKey === envKey;
  if (!valid) {
    return NextResponse.json(
      { ok: false, reason: "invalid token", hasAuth: !!auth, hasXInternal: !!xKey },
      { status: 401 }
    );
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
