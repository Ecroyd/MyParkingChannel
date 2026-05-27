/**
 * Canonical cancellation detection for booking_import_staging rows.
 */
import { isCancelledSupplierStatus } from "@/lib/ingest/importStatusMapping";

export type StagingRowLike = {
  status?: string | null;
  external_status?: string | null;
  raw_json?: unknown;
};

export function isCancelledRow(row: StagingRowLike): boolean {
  const externalStatus =
    row.external_status ??
    (row.raw_json &&
    typeof row.raw_json === "object" &&
    row.raw_json !== null &&
    "external_status" in row.raw_json
      ? String((row.raw_json as { external_status?: unknown }).external_status ?? "")
      : null);

  if (isCancelledSupplierStatus(row.status) || isCancelledSupplierStatus(externalStatus)) {
    return true;
  }

  const rawStr =
    row.raw_json == null
      ? ""
      : typeof row.raw_json === "string"
        ? row.raw_json
        : JSON.stringify(row.raw_json);

  return /\bCANX\b/i.test(rawStr) || /cancel/i.test(rawStr);
}
