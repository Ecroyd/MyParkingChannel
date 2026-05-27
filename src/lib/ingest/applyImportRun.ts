import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ImportRowLog,
  upsertBookingFromStagingRow,
  type StagingRow,
} from "@/lib/ingest/bookingFromStaging";

export type ApplyImportRunResult = {
  inserted: number;
  updated: number;
  cancelled: number;
  skipped: number;
  errors: number;
  logs: ImportRowLog[];
};

function logImportRow(log: ImportRowLog): void {
  console.log(
    "[import-row]",
    JSON.stringify({
      reference: log.reference,
      action: log.action,
      parsed_status: log.parsed_status,
      mapped_status: log.mapped_status,
      source_filename: log.source_filename,
      ...(log.reason ? { reason: log.reason } : {}),
    })
  );
}

/**
 * Promote all staging rows for an import run into public.bookings (real upsert).
 */
export async function applyImportRun(
  supabase: SupabaseClient,
  runId: string
): Promise<ApplyImportRunResult> {
  const { data: rows, error } = await supabase
    .from("booking_import_staging")
    .select("*")
    .eq("run_id", runId);

  if (error) {
    throw new Error(`Failed to load staging for run ${runId}: ${error.message}`);
  }

  const result: ApplyImportRunResult = {
    inserted: 0,
    updated: 0,
    cancelled: 0,
    skipped: 0,
    errors: 0,
    logs: [],
  };

  if (!rows?.length) {
    return result;
  }

  const tenantId = rows[0].tenant_id as string;
  const { data: tenantData } = await supabase
    .from("tenants")
    .select("timezone")
    .eq("id", tenantId)
    .single();
  const tz = tenantData?.timezone ?? "Europe/London";

  for (const row of rows as StagingRow[]) {
    const upsertResult = await upsertBookingFromStagingRow(supabase, row, {
      timezone: tz,
      sourceFilename: (row.source_filename as string | null) ?? null,
    });

    const log = upsertResult.log;
    result.logs.push(log);
    logImportRow(log);

    switch (log.action) {
      case "inserted":
        result.inserted++;
        break;
      case "updated":
        result.updated++;
        break;
      case "skipped":
        result.skipped++;
        break;
      case "error":
        result.errors++;
        break;
    }

    if (log.mapped_status === "cancelled" && log.action !== "skipped" && log.action !== "error") {
      result.cancelled++;
    }
  }

  return result;
}
