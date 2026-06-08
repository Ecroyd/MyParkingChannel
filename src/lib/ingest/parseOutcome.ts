import type { HolidayExtrasParseStats } from "@/lib/importers/holidayExtras/parseHolidayExtras";
import { formatHolidayExtrasParseReason } from "@/lib/importers/holidayExtras/parseHolidayExtras";

export type ParseOutcomeKind = "parsed" | "empty" | "failed" | "skipped";

export type BuildParseReasonInput = {
  holidayExtrasStats?: HolidayExtrasParseStats | null;
  rowsParsed?: number;
  rowsStaged?: number;
  rowsUpserted?: number;
  rowsCancelled?: number;
  rowsErrors?: number;
  duplicateDedupeKeys?: number;
  extra?: string;
};

export function buildParseReasonSummary(input: BuildParseReasonInput): string {
  const parts: string[] = [];
  if (input.holidayExtrasStats) {
    parts.push(formatHolidayExtrasParseReason(input.holidayExtrasStats));
  }
  if (input.rowsParsed != null) parts.push(`rows_parsed=${input.rowsParsed}`);
  if (input.rowsStaged != null) parts.push(`rows_staged=${input.rowsStaged}`);
  if (input.rowsUpserted != null) parts.push(`rows_upserted=${input.rowsUpserted}`);
  if (input.rowsCancelled != null) parts.push(`rows_cancelled=${input.rowsCancelled}`);
  if (input.rowsErrors != null) parts.push(`rows_errors=${input.rowsErrors}`);
  if (input.duplicateDedupeKeys != null && input.duplicateDedupeKeys > 0) {
    parts.push(`duplicate_dedupe_keys=${input.duplicateDedupeKeys}`);
  }
  if (input.extra) parts.push(input.extra);
  return parts.join("; ");
}

/**
 * parsed  → rows landed in staging and bookings were upserted
 * empty   → parser ran but 0 staging rows (with skip breakdown in parse_reason)
 * failed  → hard error
 */
export function resolveParseOutcome(opts: {
  rowsAccepted: number;
  rowsStaged: number;
  rowsUpserted: number;
  rowsCancelled: number;
}): ParseOutcomeKind {
  if (opts.rowsStaged > 0 && (opts.rowsUpserted > 0 || opts.rowsCancelled > 0)) {
    return "parsed";
  }
  if (opts.rowsAccepted > 0 && opts.rowsStaged > 0) {
    return "parsed";
  }
  return "empty";
}
