import { NextResponse } from "next/server";
import { runParseReceived } from "@/lib/ingest/runParseReceived";
import { requireCronOrPlatformAdminApi } from "@/lib/auth/apiGuards";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await requireCronOrPlatformAdminApi(req);
  if (guard.response) return guard.response;
  const { parsedCount, error } = await runParseReceived(25);
  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, parsedCount });
}
