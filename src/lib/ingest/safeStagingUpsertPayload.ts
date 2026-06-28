/**
 * Whitelist of columns on public.booking_import_staging.
 * PostgREST rejects unknown columns (e.g. customer_email is not on staging).
 */
export const ALLOWED_STAGING_UPSERT_FIELDS = [
  "tenant_id",
  "run_id",
  "source",
  "source_email_id",
  "source_filename",
  "reference",
  "external_reference",
  "external_status",
  "start_at",
  "end_at",
  "vehicle_reg",
  "vehicle_make",
  "vehicle_model",
  "vehicle_colour",
  "customer_title",
  "customer_firstname",
  "customer_lastname",
  "customer_name",
  "phone",
  "flight_number",
  "return_flight_no",
  "product_code",
  "currency",
  "total_price",
  "price",
  "status",
  "money_received",
  "notes",
  "dedupe_key",
  "raw_json",
] as const;

const ALLOWED_SET = new Set<string>(ALLOWED_STAGING_UPSERT_FIELDS);

export type SafeStagingPayloadResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

/** Strip columns that are not on booking_import_staging (e.g. customer_email). */
export function safeStagingUpsertPayload(
  payload: Record<string, unknown>
): SafeStagingPayloadResult {
  const normalized = { ...payload };

  if (
    normalized.customer_email !== undefined &&
    normalized.customer_email !== null &&
    normalized.raw_json &&
    typeof normalized.raw_json === "object"
  ) {
    const raw = normalized.raw_json as Record<string, unknown>;
    const extracted =
      raw.extracted && typeof raw.extracted === "object"
        ? { ...(raw.extracted as Record<string, unknown>) }
        : {};
    if (!extracted.email) {
      extracted.email = normalized.customer_email;
    }
    normalized.raw_json = { ...raw, extracted };
  }
  delete normalized.customer_email;
  delete normalized.customer_phone;
  delete normalized.supplier_status;

  const unknown = Object.keys(normalized).filter((k) => !ALLOWED_SET.has(k));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown staging field(s): ${unknown.join(", ")}`,
    };
  }

  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_STAGING_UPSERT_FIELDS) {
    if (normalized[key] !== undefined) {
      data[key] = normalized[key];
    }
  }
  return { ok: true, data };
}
