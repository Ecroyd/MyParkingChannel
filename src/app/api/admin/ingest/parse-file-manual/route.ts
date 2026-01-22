import { NextResponse } from "next/server";
import { parseEmailFile } from "@/lib/ingest/parseEmailFile";

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
    const result = await parseEmailFile(fileId, tenantId);
    
    return NextResponse.json({
      ok: true,
      ...result,
    });
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
