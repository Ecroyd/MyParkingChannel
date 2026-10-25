import {
  mapSupplierStatusToBookingStatus,
  normalizeSupplierStatus,
  type BookingStatusEnum,
} from "@/lib/ingest/importStatusMapping";

/**
 * Map a raw status cell from a manual CSV/XLSX import to bookings.status.
 *
 * Delegates to the shared supplier mapping, plus import-only rules the shared mapping does not
 * know: "No Show", "Refunded", "Void"/"Voided", "Deleted" and "Rejected" are treated as cancelled
 * (there is no no_show booking status, and the space must not stay held).
 *
 * Returns null when the cell is empty, so callers can tell "no status given" from "reserved".
 */
export function mapImportStatus(raw: string | null | undefined): BookingStatusEnum | null {
  const norm = normalizeSupplierStatus(raw);
  if (!norm) return null;
  const compact = norm.replace(/[^A-Z]/g, "");
  if (
    compact === "NOSHOW" ||
    compact.startsWith("REFUND") ||
    compact === "VOID" ||
    compact === "VOIDED" ||
    compact === "DELETED" ||
    compact === "REJECTED" ||
    compact === "CANCELED" ||
    compact === "CANX"
  ) {
    return "cancelled";
  }
  return mapSupplierStatusToBookingStatus(norm);
}

/** Status label for the preview table (raw cell → mapped status). */
export function previewStatus(raw: string | null | undefined): string {
  return mapImportStatus(raw) ?? "reserved";
}
