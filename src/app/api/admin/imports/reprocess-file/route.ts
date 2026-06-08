import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { getServiceSupabase } from "@/lib/supabase/service";
import { reprocessIngestEmailFile } from "@/lib/ingest/reprocessIngestEmailFile";

/**
 * POST /api/admin/imports/reprocess-file
 * Body: { fileId?: string; filename?: string; tenantId?: string }
 * Re-parses an ingest attachment and upserts all rows into bookings.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== "admin" && ctx.role !== "owner")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const fileId = body.fileId ?? body.file_id ?? null;
    const filename = body.filename ?? null;
    let tenantId = body.tenantId ?? body.tenant_id ?? ctx.tenantId ?? null;

    const supabase = getServiceSupabase();

    let resolvedFileId = fileId as string | null;
    if (!resolvedFileId && filename) {
      const { data: fileRow, error: lookupErr } = await supabase
        .from("ingest_email_files")
        .select("id")
        .eq("filename", filename)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lookupErr) {
        return NextResponse.json({ error: lookupErr.message }, { status: 500 });
      }
      if (!fileRow) {
        return NextResponse.json({ error: "File not found by filename" }, { status: 404 });
      }
      resolvedFileId = fileRow.id;
    }

    if (!resolvedFileId) {
      return NextResponse.json(
        { error: "fileId or filename required" },
        { status: 400 }
      );
    }
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    const result = await reprocessIngestEmailFile(resolvedFileId, tenantId);

    const importResult = result.importResult ?? {};
    return NextResponse.json({
      ok: result.ok,
      fileId: result.fileId,
      filename: result.filename,
      rowsParsed: result.rowsParsed,
      stagedCount: result.stagedCount,
      inserted: importResult.insertedCount ?? 0,
      updated: importResult.updatedCount ?? 0,
      cancelled: importResult.cancelledCount ?? 0,
      errors: importResult.errorCount ?? importResult.errors?.length ?? 0,
      successCount: importResult.successCount ?? 0,
      runId: importResult.runId ?? null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
