import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { createAdminClient } from "@/lib/supabase/server-admin";

/**
 * GET /api/admin/import-runs
 * List last 20 import_runs for the current tenant.
 */
export async function GET(req: Request) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== "admin" && ctx.role !== "owner")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    const admin = await createAdminClient();
    const { data: runs, error } = await admin
      .from("import_runs")
      .select("id, created_at, profile_name, inserted_count, skipped_duplicates, error_count, meta")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ runs: runs ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
