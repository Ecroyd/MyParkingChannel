/**
 * Whitelist of columns safe to send on public.bookings upsert/insert.
 * Prevents PostgREST schema-cache failures when a column is missing in DB.
 */
import { resolveCustomerName } from "@/lib/bookings/normalizeCustomerName";

export const ALLOWED_BOOKING_UPSERT_FIELDS = [
  "tenant_id",
  "reference",
  "customer_name",
  "customer_email",
  "customer_phone",
  "plate",
  "car_make",
  "car_model",
  "car_color",
  "start_at",
  "end_at",
  "status",
  "gate_status",
  "ops_status",
  "money_charged",
  "money_received",
  "source",
  "external_source",
  "external_status",
  "anpr_status",
  "flight_number",
  "return_flight_number",
  "notes",
  "dedupe_key",
  "updated_at",
  "is_incomplete",
  "missing_fields",
] as const;

export type AllowedBookingUpsertField = (typeof ALLOWED_BOOKING_UPSERT_FIELDS)[number];

const ALLOWED_SET = new Set<string>(ALLOWED_BOOKING_UPSERT_FIELDS);

export type SafeBookingPayloadResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

function isPlaceholderImportEmail(email: string): boolean {
  return /@imports\.local$/i.test(email) || /@myparkingchannel\.app$/i.test(email);
}

/**
 * Normalize a raw booking payload before insert/update:
 * - drop supplier_status (map to external_status when missing)
 * - strip unknown columns
 * - guarantee customer_name is never null
 */
export function toBookingInsertPayload(
  payload: Record<string, unknown>
): SafeBookingPayloadResult {
  const normalized: Record<string, unknown> = { ...payload };

  if (
    normalized.supplier_status !== undefined &&
    normalized.supplier_status !== null &&
    (normalized.external_status === undefined || normalized.external_status === null)
  ) {
    normalized.external_status = normalized.supplier_status;
  }
  delete normalized.supplier_status;

  const customerEmail =
    typeof normalized.customer_email === "string" ? normalized.customer_email : null;
  const resolved = resolveCustomerName({
    customerName: normalized.customer_name as string | null,
    customerLastName: normalized.customer_lastname as string | null | undefined,
    customerEmail:
      customerEmail && !isPlaceholderImportEmail(customerEmail) ? customerEmail : null,
  });
  normalized.customer_name = resolved.name;
  if (resolved.missingCustomerName) {
    normalized.is_incomplete = true;
    const missing = Array.isArray(normalized.missing_fields)
      ? [...(normalized.missing_fields as string[])]
      : [];
    if (!missing.includes("customer_name")) missing.push("customer_name");
    normalized.missing_fields = missing;
  }

  const keys = Object.keys(normalized);
  const unknown = keys.filter((k) => !ALLOWED_SET.has(k));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown booking field(s) not in schema whitelist: ${unknown.join(", ")}`,
    };
  }

  const required = ["tenant_id", "reference", "customer_name", "start_at", "end_at"] as const;
  for (const key of required) {
    const val = normalized[key];
    if (val === undefined || val === null || String(val).trim() === "") {
      return { ok: false, error: `Missing required booking field: ${key}` };
    }
  }

  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_BOOKING_UPSERT_FIELDS) {
    if (normalized[key] !== undefined) {
      data[key] = normalized[key];
    }
  }
  return { ok: true, data };
}

/** @deprecated use toBookingInsertPayload */
export function safeBookingUpsertPayload(
  payload: Record<string, unknown>
): SafeBookingPayloadResult {
  return toBookingInsertPayload(payload);
}
