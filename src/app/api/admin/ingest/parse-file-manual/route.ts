import { NextResponse } from "next/server";
import { reprocessIngestEmailFile } from "@/lib/ingest/reprocessIngestEmailFile";

export const runtime = "nodejs";

/**
 * Manual parse endpoint - call with fileId and tenantId
 * POST /api/admin/ingest/parse-file-manual
 * Body: { fileId: string, tenantId: string }
 */
export async function POST(req: Request) {
  try {
    const { fileId, tenantId } = await req.json();

    if (!fileId) {
      return NextResponse.json({ error: "fileId required" }, { status: 400 });
    }
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    console.log(`[parse-file-manual] Manual parse triggered for file ${fileId}, tenant ${tenantId}`);

    // Use the shared parse function
    const result = await reprocessIngestEmailFile(fileId, tenantId);
    
    // result already has 'ok' property, so just return it
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`[parse-file-manual] Error:`, err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err?.message || "unknown error",
        stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
