import { NextResponse } from "next/server";
import { parseEmailFile } from "@/lib/ingest/parseEmailFile";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { fileId, tenantId } = await req.json();

    if (!fileId) {
      return NextResponse.json({ error: "fileId required" }, { status: 400 });
    }
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    // Use the shared parse function
    const result = await parseEmailFile(fileId, tenantId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`[parse-file] Error:`, err);
    return NextResponse.json(
      { ok: false, error: err?.message || "unknown error" },
      { status: 500 }
    );
  }
}
