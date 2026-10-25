/**
 * Canonical cancellation detection for booking_import_staging rows.
 */
import { isCancelledSupplierStatus } from "@/lib/ingest/importStatusMapping";

export type StagingRowLike = {
  status?: string | null;
  external_status?: string | null;
  raw_json?: unknown;
};

function rawStatusField(raw: unknown, key: "external_status" | "status"): string | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>)[key];
  return v == null ? null : String(v);
}

/**
 * True only when a status field says cancelled (status, external_status, raw_json.external_status,
 * raw_json.status) or the supplier's explicit CANX token appears in the raw row.
 * Free text such as "Free cancellation" or a T&Cs note must not mark a booking cancelled.
 */
export function isCancelledRow(row: StagingRowLike): boolean {
  const candidates = [
    row.status,
    row.external_status,
    rawStatusField(row.raw_json, "external_status"),
    rawStatusField(row.raw_json, "status"),
  ];
  if (candidates.some((s) => isCancelledSupplierStatus(s))) return true;

  const rawStr =
    row.raw_json == null
      ? ""
      : typeof row.raw_json === "string"
        ? row.raw_json
        : JSON.stringify(row.raw_json);

  return /\bCANX\b/i.test(rawStr);
}
