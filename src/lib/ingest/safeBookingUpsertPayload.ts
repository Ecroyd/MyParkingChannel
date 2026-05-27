/**
 * Whitelist of columns safe to send on public.bookings upsert/insert.
 * Prevents PostgREST schema-cache failures when a column is missing in DB.
 */
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
  "supplier_status",
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

/**
 * Strip unknown fields and return only whitelisted booking columns.
 * Rejects payloads that include keys not in the allowed list.
 */
export function safeBookingUpsertPayload(
  payload: Record<string, unknown>
): SafeBookingPayloadResult {
  const keys = Object.keys(payload);
  const unknown = keys.filter((k) => !ALLOWED_SET.has(k));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown booking field(s) not in schema whitelist: ${unknown.join(", ")}`,
    };
  }

  const data: Record<string, unknown> = {};
  for (const key of ALLOWED_BOOKING_UPSERT_FIELDS) {
    if (payload[key] !== undefined) {
      data[key] = payload[key];
    }
  }
  return { ok: true, data };
}
