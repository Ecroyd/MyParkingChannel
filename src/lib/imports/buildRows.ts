/**
 * Pure builder for the admin manual CSV/XLSX import: file rows + column map → canonical rows,
 * with per-row errors and in-file duplicate detection. Used by the upload screen (preview)
 * and covered by unit tests.
 */
import { parseMoney } from "@/lib/parseMoney";
import { composeLocalDateTime, type DateParseOptions, type CellValue } from "@/lib/imports/datetime";
import { getCell, getRawCell, normalisePhoneUK } from "@/lib/imports/utils";
import type { CanonicalBooking, ImportProfileMap } from "@/lib/imports/types";

export type RowIssue = { rowNumber: number; reference: string; reason: string };

export type BuildRowsResult = {
  rows: CanonicalBooking[];
  errors: RowIssue[];
  duplicates: RowIssue[];
  headerSkipped: number;
};

export type BuildRowsOptions = {
  /** Treat the first row as a header (operator-confirmed). Only row 0 can ever be a header. */
  hasHeader: boolean;
  source: string;
  dateOpts?: DateParseOptions;
  /** Keep the original row for the Holiday Extras phone finder. */
  includeRawRow?: boolean;
  /** Original 1-based file row numbers, parallel to `rows` (empty rows removed upstream). */
  rowNumbers?: number[];
};

function composeSide(
  r: unknown[],
  tsCol: string | undefined,
  dateCol: string | undefined,
  timeCol: string | undefined,
  opts: DateParseOptions
) {
  const ts = tsCol ? getRawCell(r as any[], tsCol) : "";
  if (ts !== "") {
    // A separately mapped time column still wins over the timestamp's time if filled in.
    const t = timeCol ? getRawCell(r as any[], timeCol) : "";
    return composeLocalDateTime(ts as CellValue, t as CellValue, opts);
  }
  return composeLocalDateTime(
    getRawCell(r as any[], dateCol) as CellValue,
    timeCol ? (getRawCell(r as any[], timeCol) as CellValue) : "",
    opts
  );
}

/** "-", "n/a", "none" in a money cell mean "not given". */
function blankPlaceholder(v: string | number): string | number {
  return typeof v === "string" && /^(-+|n\/?a|none|null)$/i.test(v) ? "" : v;
}

export function buildImportRows(
  fileRows: unknown[][],
  map: ImportProfileMap,
  options: BuildRowsOptions
): BuildRowsResult {
  const dateOpts = options.dateOpts ?? {};
  const out: CanonicalBooking[] = [];
  const errors: RowIssue[] = [];
  const startIndex = options.hasHeader && fileRows.length > 0 ? 1 : 0;

  for (let i = startIndex; i < fileRows.length; i++) {
    const r = (fileRows[i] ?? []) as any[];
    const rowNumber = options.rowNumbers?.[i] ?? i + 1;
    const reference = getCell(r, map.reference).toUpperCase();
    const problems: string[] = [];

    if (!reference) problems.push("missing reference");

    const start = composeSide(r, map.start_timestamp, map.start_date, map.start_time, dateOpts);
    const end = composeSide(r, map.end_timestamp, map.end_date, map.end_time, dateOpts);
    if (!start.ok) problems.push(`start: ${start.error}`);
    if (!end.ok) problems.push(`end: ${end.error}`);
    if (start.ok && end.ok && end.value < start.value) problems.push("end is before start");

    // parseMoney: "£12.50", "1,234.00", "12,50" → number; empty → null; "0" → 0
    const priceCell = blankPlaceholder(getRawCell(r, map.price));
    const receivedCell = blankPlaceholder(getRawCell(r, map.money_received));
    const price = parseMoney(priceCell);
    const money_received = parseMoney(receivedCell);
    if (priceCell !== "" && price === null) problems.push(`unrecognised price "${priceCell}"`);
    if (receivedCell !== "" && money_received === null) {
      problems.push(`unrecognised money received "${receivedCell}"`);
    }

    if (problems.length) {
      errors.push({ rowNumber, reference, reason: problems.join("; ") });
      continue;
    }

    let customer_firstname: string;
    let customer_lastname: string;
    const fullName = getCell(r, map.customer_name);
    if (fullName) {
      const parts = fullName.split(/\s+/);
      if (parts.length === 1) {
        customer_firstname = "";
        customer_lastname = parts[0].toUpperCase();
      } else {
        customer_lastname = parts[parts.length - 1].toUpperCase();
        customer_firstname = parts.slice(0, -1).join(" ");
      }
    } else {
      customer_lastname = getCell(r, map.customer_lastname).toUpperCase();
      customer_firstname = getCell(r, map.customer_firstname);
    }

    const phoneRaw = getRawCell(r, map.phone);
    const phone = phoneRaw === "" ? "" : normalisePhoneUK(phoneRaw, { fromNumericCell: typeof phoneRaw === "number" });

    const row: CanonicalBooking = {
      source: options.source,
      reference,
      customer_name: `${customer_firstname} ${customer_lastname}`.trim(),
      customer_lastname,
      customer_title: getCell(r, map.customer_title).toUpperCase(),
      customer_firstname,
      start_at: (start as { ok: true; value: string }).value,
      end_at: (end as { ok: true; value: string }).value,
      vehicle_reg: getCell(r, map.vehicle_reg).toUpperCase(),
      vehicle_colour: getCell(r, map.vehicle_colour).toUpperCase(),
      vehicle_make: getCell(r, map.vehicle_make).toUpperCase(),
      vehicle_model: getCell(r, map.vehicle_model).toUpperCase(),
      flight_number: getCell(r, map.flight_number).toUpperCase(),
      phone,
      status: getCell(r, map.status),
      price,
      money_received,
      notes: getCell(r, map.notes),
      rowNumber,
    };
    if (options.includeRawRow) row._rawRow = r;
    out.push(row);
  }

  const { kept, duplicates } = dedupeByReference(out);
  return { rows: kept, errors, duplicates, headerSkipped: startIndex };
}

/**
 * Within one file, the LAST row for a reference wins; earlier rows are reported as duplicates.
 */
export function dedupeByReference<T extends { reference: string; rowNumber?: number }>(
  rows: T[]
): { kept: T[]; duplicates: RowIssue[] } {
  const lastIndex = new Map<string, number>();
  rows.forEach((r, i) => lastIndex.set(r.reference.toUpperCase(), i));
  const kept: T[] = [];
  const duplicates: RowIssue[] = [];
  rows.forEach((r, i) => {
    const key = r.reference.toUpperCase();
    const last = lastIndex.get(key)!;
    if (last === i) {
      kept.push(r);
    } else {
      duplicates.push({
        rowNumber: r.rowNumber ?? i + 1,
        reference: r.reference,
        reason: `duplicate reference in file; row ${rows[last].rowNumber ?? last + 1} used instead`,
      });
    }
  });
  return { kept, duplicates };
}
