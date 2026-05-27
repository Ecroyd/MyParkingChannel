import { NextResponse } from "next/server";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { applyImportRun } from "@/lib/ingest/promoteStagingToBookings";

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
      upserted_count: result.bookings_inserted_count + result.bookings_updated_count,
      inserted: result.bookings_inserted_count,
      updated: result.bookings_updated_count,
      cancelled_count: result.bookings_cancelled_count,
      staging_rows_count: result.staging_rows_count,
      bookings_inserted_count: result.bookings_inserted_count,
      bookings_updated_count: result.bookings_updated_count,
      bookings_cancelled_count: result.bookings_cancelled_count,
      booking_upsert_errors: result.booking_upsert_errors,
      skipped: result.skipped,
      errors: result.booking_upsert_errors.length,
      logs: result.logs,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
