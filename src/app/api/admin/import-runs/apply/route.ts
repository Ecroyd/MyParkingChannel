import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { applyImportRun } from "@/lib/ingest/applyImportRun";

/**
 * POST /api/admin/import-runs/apply
 * Body: { runId: string }
 * Promotes staging rows to bookings via tenant_id + reference upsert.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== "admin" && ctx.role !== "owner")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const runId = body.runId ?? body.run_id ?? null;
    if (!runId) {
      return NextResponse.json({ error: "runId required" }, { status: 400 });
    }

    const admin = await createAdminClient();
    const result = await applyImportRun(admin, runId);

    return NextResponse.json({
      ok: true,
      upserted_count: result.inserted + result.updated,
      inserted: result.inserted,
      updated: result.updated,
      cancelled_count: result.cancelled,
      skipped: result.skipped,
      errors: result.errors,
      logs: result.logs,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
