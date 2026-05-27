import type { SupabaseClient } from "@supabase/supabase-js";

export function formatPostgresError(err: unknown): string {
  if (err == null) return "unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const extra = err as Error & { code?: string; details?: string; hint?: string };
    return [extra.message, extra.code, extra.details, extra.hint].filter(Boolean).join(" | ");
  }
  if (typeof err === "object" && "message" in err) {
    const e = err as { message: string; code?: string; details?: string; hint?: string };
    return [e.message, e.code, e.details, e.hint].filter(Boolean).join(" | ");
  }
  return String(err);
}

export async function logBookingPromotionError(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    importFileId?: string | null;
    importRunId?: string | null;
    rowIndex: number;
    reason: string;
    rowData: Record<string, unknown> | null;
  }
): Promise<void> {
  const { tenantId, importFileId, importRunId, rowIndex, reason, rowData } = params;

  console.error(
    "[booking-promotion-error]",
    JSON.stringify({ tenantId, importFileId, importRunId, rowIndex, reason })
  );

  try {
    const { error } = await supabase.from("booking_import_errors").insert({
      tenant_id: tenantId,
      import_file_id: importFileId ?? null,
      import_run_id: importRunId ?? null,
      row_index: rowIndex,
      reason,
      row_data: rowData,
    });

    if (error) {
      console.error(
        "[booking-promotion-error] failed to insert booking_import_errors",
        error
      );
    }
  } catch (insertErr) {
    console.error(
      "[booking-promotion-error] exception inserting booking_import_errors",
      insertErr
    );
  }
}
