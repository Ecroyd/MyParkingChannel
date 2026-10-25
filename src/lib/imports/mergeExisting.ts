/**
 * Pure rules for applying a manual-import row to a booking that already exists
 * (same tenant + reference). Used by /api/import/bookings/commit.
 */
import type { BookingStatusEnum } from "@/lib/ingest/importStatusMapping";

export type ExistingBooking = {
  id: string;
  reference: string;
  source: string | null;
  status: string | null;
  gate_status?: string | null;
  ops_status?: string | null;
  anpr_status?: string | null;
};

export type MatchResult =
  | { kind: "none" }
  | { kind: "match"; booking: ExistingBooking }
  | { kind: "ambiguous"; count: number };

/**
 * Find the existing booking for an imported reference. One booking with that reference (any
 * channel) is the match. If several channels share the reference, only an exact source match
 * is accepted; otherwise the row is ambiguous and must not be applied.
 */
export function pickExistingMatch(
  candidates: ExistingBooking[] | undefined,
  reference: string,
  source: string | null | undefined
): MatchResult {
  const ref = reference.trim().toUpperCase();
  const same = (candidates ?? []).filter((c) => (c.reference ?? "").trim().toUpperCase() === ref);
  if (same.length === 0) return { kind: "none" };
  if (same.length === 1) return { kind: "match", booking: same[0] };
  const exact = same.filter((c) => (c.source ?? "") === (source ?? ""));
  if (exact.length === 1) return { kind: "match", booking: exact[0] };
  return { kind: "ambiguous", count: same.length };
}

const OPS_FIELDS = ["gate_status", "ops_status", "anpr_status"] as const;
const OPTIONAL_TEXT_FIELDS = [
  "customer_email",
  "customer_phone",
  "plate",
  "car_make",
  "car_model",
  "car_color",
  "flight_number",
  "return_flight_number",
  "notes",
] as const;

export type UpdateFlags = {
  /** Mapped status of the import row, or null when the status cell was empty. */
  newStatus: BookingStatusEnum | null;
  /** Price / money received cells had a value (0 counts as a value). */
  priceGiven: boolean;
  receivedGiven: boolean;
  /** The file had no customer name for this row (payload holds a placeholder). */
  nameMissing: boolean;
};

/**
 * Turn the full insert payload into a safe UPDATE for an existing booking:
 * - never change tenant/reference/source attribution
 * - empty cells keep existing values (no blanking, no zeroing money)
 * - never downgrade operational state: checked_in/checked_out keep their status unless the
 *   row is a cancellation; a cancelled booking is not re-activated by an import
 * - gate/ops/anpr status only change for cancellations
 */
export function buildImportUpdatePayload(
  existing: ExistingBooking,
  payload: Record<string, unknown>,
  flags: UpdateFlags
): { update: Record<string, unknown>; warnings: string[] } {
  const update: Record<string, unknown> = { ...payload };
  const warnings: string[] = [];

  delete update.tenant_id;
  delete update.reference;
  delete update.source;
  delete update.external_source;
  for (const f of OPS_FIELDS) delete update[f];

  if (!flags.priceGiven) delete update.money_charged;
  if (!flags.receivedGiven) delete update.money_received;

  for (const f of OPTIONAL_TEXT_FIELDS) {
    const v = update[f];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) delete update[f];
  }

  if (flags.nameMissing) {
    delete update.customer_name;
    delete update.is_incomplete;
    delete update.missing_fields;
  }

  const current = (existing.status ?? "").toLowerCase();
  if (flags.newStatus === null) {
    delete update.status;
    delete update.external_status;
  } else if (flags.newStatus === "cancelled") {
    update.status = "cancelled";
    update.gate_status = "cancelled";
    update.ops_status = "cancelled";
  } else if (current === "checked_in" || current === "checked_out") {
    delete update.status;
    warnings.push(`status kept as ${current} (file says ${flags.newStatus})`);
  } else if (current === "cancelled") {
    delete update.status;
    warnings.push(`booking is cancelled; not re-activated by import (file says ${flags.newStatus})`);
  }

  return { update, warnings };
}

/** Ops fields for a newly inserted cancelled booking (matches the email ingest convention). */
export function cancellationOpsFields(status: string | null | undefined): Record<string, string> {
  return status === "cancelled" ? { gate_status: "cancelled", ops_status: "cancelled" } : {};
}
