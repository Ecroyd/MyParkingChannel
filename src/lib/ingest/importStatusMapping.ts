/**
 * Supplier/file status tokens → booking.status and external_status audit field.
 */

export type BookingStatusEnum = "reserved" | "checked_in" | "checked_out" | "cancelled";

/** Strip asterisks and whitespace; uppercase token (FIRM, *CANX* → CANX). */
export function normalizeSupplierStatus(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\*/g, "").trim().toUpperCase();
  return s || null;
}

/**
 * Map supplier status to bookings.status.
 * *FIRM* / *AMND* / NEW → reserved; *CANX* / CANCELLED / cancel* → cancelled.
 */
export function mapSupplierStatusToBookingStatus(
  raw: string | null | undefined
): BookingStatusEnum {
  const norm = normalizeSupplierStatus(raw);
  if (!norm) return "reserved";

  if (
    norm === "CANX" ||
    norm === "CANCELLED" ||
    norm.startsWith("CANCEL")
  ) {
    return "cancelled";
  }

  if (norm === "FIRM" || norm === "AMND" || norm === "NEW") {
    return "reserved";
  }

  if (/^AMEND/i.test(norm)) return "reserved";
  if (/cancel/i.test(norm)) return "cancelled";

  return "reserved";
}

export function isCancelledSupplierStatus(raw: string | null | undefined): boolean {
  return mapSupplierStatusToBookingStatus(raw) === "cancelled";
}
