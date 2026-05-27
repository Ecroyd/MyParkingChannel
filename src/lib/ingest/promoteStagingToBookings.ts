import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type ImportRowLog,
  upsertBookingFromStagingRow,
  type StagingRow,
} from "@/lib/ingest/bookingFromStaging";
import {
  formatPostgresError,
  logBookingPromotionError,
} from "@/lib/ingest/logBookingPromotionError";

export type BookingUpsertError = { reference: string; reason: string };

export type ImportPromotionResult = {
  staging_rows_count: number;
  bookings_inserted_count: number;
  bookings_updated_count: number;
  bookings_cancelled_count: number;
  booking_upsert_errors: BookingUpsertError[];
  skipped: number;
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

export function logImportPromotionResult(result: ImportPromotionResult): void {
  console.log(
    "[import-promotion]",
    JSON.stringify({
      staging_rows_count: result.staging_rows_count,
      bookings_inserted_count: result.bookings_inserted_count,
      bookings_updated_count: result.bookings_updated_count,
      bookings_cancelled_count: result.bookings_cancelled_count,
      booking_upsert_errors: result.booking_upsert_errors,
      skipped: result.skipped,
    })
  );
}

async function loadStagingRows(
  supabase: SupabaseClient,
  opts: {
    runId?: string | null;
    tenantId: string;
    dedupeKeys?: string[];
    stagingIds?: string[];
  }
): Promise<StagingRow[]> {
  if (opts.stagingIds?.length) {
    const { data, error } = await supabase
      .from("booking_import_staging")
      .select("*")
      .in("id", opts.stagingIds);
    if (error) throw new Error(`Failed to load staging by id: ${error.message}`);
    return (data ?? []) as StagingRow[];
  }

  if (opts.dedupeKeys?.length) {
    const { data, error } = await supabase
      .from("booking_import_staging")
      .select("*")
      .eq("tenant_id", opts.tenantId)
      .in("dedupe_key", opts.dedupeKeys);
    if (error) throw new Error(`Failed to load staging by dedupe_key: ${error.message}`);
    return (data ?? []) as StagingRow[];
  }

  if (opts.runId) {
    const { data, error } = await supabase
      .from("booking_import_staging")
      .select("*")
      .eq("run_id", opts.runId);
    if (error) throw new Error(`Failed to load staging for run ${opts.runId}: ${error.message}`);
    return (data ?? []) as StagingRow[];
  }

  return [];
}

/**
 * Promote staging rows into public.bookings (update-by-reference, then insert).
 */
export async function promoteStagingToBookings(
  supabase: SupabaseClient,
  opts: {
    tenantId: string;
    runId?: string | null;
    importFileId?: string | null;
    importRunId?: string | null;
    dedupeKeys?: string[];
    stagingIds?: string[];
    /** 0-based row index per staging dedupe_key (e.g. from parse order) */
    rowIndexByDedupeKey?: Record<string, number>;
  }
): Promise<ImportPromotionResult> {
  const rows = await loadStagingRows(supabase, opts);

  const result: ImportPromotionResult = {
    staging_rows_count: rows.length,
    bookings_inserted_count: 0,
    bookings_updated_count: 0,
    bookings_cancelled_count: 0,
    booking_upsert_errors: [],
    skipped: 0,
    logs: [],
  };

  if (!rows.length) {
    logImportPromotionResult(result);
    return result;
  }

  const tenantId = opts.tenantId || (rows[0].tenant_id as string);
  const { data: tenantData } = await supabase
    .from("tenants")
    .select("timezone")
    .eq("id", tenantId)
    .single();
  const tz = tenantData?.timezone ?? "Europe/London";

  const importRunId = opts.importRunId ?? opts.runId ?? null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dedupeKey = String(row.dedupe_key ?? "");
    const rowIndex =
      opts.rowIndexByDedupeKey?.[dedupeKey] ??
      (typeof row.row_index === "number" ? row.row_index : i);

    let upsertResult;
    try {
      upsertResult = await upsertBookingFromStagingRow(supabase, row, {
        timezone: tz,
        sourceFilename: (row.source_filename as string | null) ?? null,
      });
    } catch (promotionErr: unknown) {
      const reason = formatPostgresError(promotionErr);
      console.error("[booking-promotion-error]", {
        reference: row.reference,
        rowIndex,
        reason,
        err: promotionErr,
      });
      await logBookingPromotionError(supabase, {
        tenantId,
        importFileId: opts.importFileId ?? null,
        importRunId,
        rowIndex,
        reason,
        rowData: row as Record<string, unknown>,
      });
      result.booking_upsert_errors.push({
        reference: String(row.reference ?? row.external_reference ?? "UNKNOWN"),
        reason,
      });
      continue;
    }

    const log = upsertResult.log;
    result.logs.push(log);
    logImportRow(log);

    switch (log.action) {
      case "inserted":
        result.bookings_inserted_count++;
        break;
      case "updated":
        result.bookings_updated_count++;
        break;
      case "skipped":
        result.skipped++;
        break;
      case "error": {
        const reason = log.reason ?? "unknown error";
        console.error("[booking-promotion-error]", {
          reference: log.reference,
          rowIndex,
          reason,
        });
        await logBookingPromotionError(supabase, {
          tenantId,
          importFileId: opts.importFileId ?? null,
          importRunId,
          rowIndex,
          reason,
          rowData: upsertResult.attemptedPayload ?? (row as Record<string, unknown>),
        });
        result.booking_upsert_errors.push({
          reference: log.reference,
          reason,
        });
        break;
      }
    }

    if (
      log.mapped_status === "cancelled" &&
      log.action !== "skipped" &&
      log.action !== "error"
    ) {
      result.bookings_cancelled_count++;
    }
  }

  logImportPromotionResult(result);
  return result;
}

/** @deprecated Use promoteStagingToBookings */
export type ApplyImportRunResult = ImportPromotionResult & {
  inserted: number;
  updated: number;
  cancelled: number;
  errors: number;
};

/** @deprecated Use promoteStagingToBookings */
export async function applyImportRun(
  supabase: SupabaseClient,
  runId: string
): Promise<ApplyImportRunResult> {
  const { data: sample } = await supabase
    .from("booking_import_staging")
    .select("tenant_id")
    .eq("run_id", runId)
    .limit(1)
    .maybeSingle();

  if (!sample?.tenant_id) {
    const empty: ApplyImportRunResult = {
      staging_rows_count: 0,
      bookings_inserted_count: 0,
      bookings_updated_count: 0,
      bookings_cancelled_count: 0,
      booking_upsert_errors: [],
      skipped: 0,
      logs: [],
      inserted: 0,
      updated: 0,
      cancelled: 0,
      errors: 0,
    };
    return empty;
  }

  const promoted = await promoteStagingToBookings(supabase, {
    tenantId: sample.tenant_id,
    runId,
  });

  return {
    ...promoted,
    inserted: promoted.bookings_inserted_count,
    updated: promoted.bookings_updated_count,
    cancelled: promoted.bookings_cancelled_count,
    errors: promoted.booking_upsert_errors.length,
  };
}
