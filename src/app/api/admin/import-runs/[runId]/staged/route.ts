import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { createAdminClient } from "@/lib/supabase/server-admin";

/**
 * GET /api/admin/import-runs/[runId]/staged
 * List staged rows for the given run_id (tenant-scoped).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== "admin" && ctx.role !== "owner")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { runId } = await params;
    if (!runId) {
      return NextResponse.json({ error: "runId required" }, { status: 400 });
    }

    const admin = await createAdminClient();
    const { data: rows, error } = await admin
      .from("booking_import_staging")
      .select("id, reference, status, source, external_status, source_filename, start_at, end_at, vehicle_reg, raw_json")
      .eq("run_id", runId)
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ rows: rows ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
