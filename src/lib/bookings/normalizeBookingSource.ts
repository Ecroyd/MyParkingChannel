/**
 * Normalize supplier/channel/staging source strings to public.bookings.source (booking_source enum).
 * external_source uses platform ids (holiday_extras, aph) — never pass those as bookings.source.
 */

export const BOOKING_SOURCE_DB_VALUES = [
  "direct",
  "parkvia",
  "holiday_extras",
  "holidayextras",
  "manual",
  "other",
  "cavu",
  "aph",
  "supplier_api",
] as const;

export type BookingSourceDb = (typeof BOOKING_SOURCE_DB_VALUES)[number];

export type NormalizeBookingSourceHints = {
  channel?: string | null;
  externalSource?: string | null;
  parserKey?: string | null;
};

function normKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

/**
 * Map aliases (holidayextras, HOLIDAY_EXTRAS, aph/APH, etc.) to the canonical enum value for Postgres.
 */
export function normalizeBookingSourceForDb(
  raw: string | null | undefined,
  hints?: NormalizeBookingSourceHints
): BookingSourceDb | string {
  const s = normKey(raw);
  const ch = String(hints?.channel ?? "").trim().toUpperCase();
  const ext = normKey(hints?.externalSource);
  const parser = normKey(hints?.parserKey);

  if (
    ch === "HOLIDAY_EXTRAS" ||
    s === "holidayextras" ||
    s === "holiday_extras" ||
    ext === "holiday_extras" ||
    parser === "holiday_extras_email_import"
  ) {
    return "holiday_extras";
  }

  if (ch === "APH" || s === "aph" || ext === "aph" || parser === "aph_email_import") {
    return "aph";
  }

  if (ch === "CAVU" || s === "cavu" || ext === "cavu" || parser === "cavu_email_import") {
    return "cavu";
  }

  if (s === "parkvia") return "parkvia";
  if (s === "direct") return "direct";
  if (s === "manual") return "manual";
  if (s === "supplier_api" || s === "supplier") return "supplier_api";

  if ((BOOKING_SOURCE_DB_VALUES as readonly string[]).includes(s)) {
    if (s === "holidayextras") return "holiday_extras";
    return s;
  }

  return "other";
}
