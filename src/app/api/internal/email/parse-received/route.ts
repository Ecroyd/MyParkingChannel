import { NextResponse } from "next/server";
import { runParseReceived } from "@/lib/ingest/runParseReceived";

export const runtime = "nodejs";

export async function POST() {
  const { parsedCount, error } = await runParseReceived(25);
  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, parsedCount });
}
