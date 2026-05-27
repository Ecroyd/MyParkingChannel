/**
 * Promote a single booking_import_staging row to public.bookings.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  upsertBookingFromStagingRow,
  type StagingRow,
} from "@/lib/ingest/bookingFromStaging";

export type PromoteResult = { ok: boolean; error?: string; updated?: boolean; bookingId?: string };

export async function promoteStagingRowToBooking(
  supabase: SupabaseClient,
  tenantId: string,
  dedupeKey: string
): Promise<PromoteResult> {
  const { data: stagingRow, error: fetchErr } = await supabase
    .from("booking_import_staging")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }
  if (!stagingRow) {
    return { ok: false, error: "Staging row not found" };
  }

  const result = await upsertBookingFromStagingRow(
    supabase,
    stagingRow as StagingRow
  );

  if (result.log.action === "error") {
    return { ok: false, error: result.log.reason ?? "upsert failed" };
  }
  if (result.log.action === "skipped") {
    return { ok: false, error: result.log.reason ?? "skipped" };
  }

  return {
    ok: true,
    updated: result.log.action === "updated",
    bookingId: result.bookingId,
  };
}
