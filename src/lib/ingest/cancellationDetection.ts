/**
 * Canonical cancellation detection for booking_import_staging rows.
 * Used by apply_import_run (DB) and by parsers to set status/external_status.
 * A row is considered cancelled if ANY of:
 * - status ILIKE 'cancel%'
 * - external_status ILIKE 'cancel%'
 * - raw_json (as string) contains cancel keywords
 */
const CANCEL_KEYWORDS = /cancel/i;

export type StagingRowLike = {
  status?: string | null;
  external_status?: string | null;
  raw_json?: unknown;
};

export function isCancelledRow(row: StagingRowLike): boolean {
  const status = (row.status ?? "").toString().trim();
  const externalStatus = (row.external_status ?? "").toString().trim();
  if (CANCEL_KEYWORDS.test(status) || CANCEL_KEYWORDS.test(externalStatus)) {
    return true;
  }
  const rawStr =
    row.raw_json == null
      ? ""
      : typeof row.raw_json === "string"
        ? row.raw_json
        : JSON.stringify(row.raw_json);
  return CANCEL_KEYWORDS.test(rawStr);
}
