import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { createAdminClient } from "@/lib/supabase/server-admin";

/**
 * POST /api/admin/import-runs/apply
 * Body: { runId: string }
 * Calls apply_import_run(run_id) and returns { upserted_count, cancelled_count }.
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
    const { data, error } = await admin.rpc("apply_import_run", { p_run_id: runId });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const row = data?.[0];
    return NextResponse.json({
      ok: true,
      upserted_count: row?.upserted_count ?? 0,
      cancelled_count: row?.cancelled_count ?? 0,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
