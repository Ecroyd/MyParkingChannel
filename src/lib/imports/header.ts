import { cellToCleanString } from "@/lib/imports/utils";

const HEADER_PATTERNS = [
  /^booking[_\s-]?reference$/i,
  /^entry[_\s-]?datetime$/i,
  /^exit[_\s-]?datetime$/i,
  /^license[_\s-]?plate$/i,
  /^customer[_\s-]?name$/i,
  /^vehicle[_\s-]?reg$/i,
  /^reference$/i,
  /^ref$/i,
  /^source$/i,
  /^status$/i,
  /^booking[_\s-]?status([_\s-]?name)?$/i,
  /^booking[_\s-]?datetime$/i,
  /^flight[_\s-]?number$/i,
  /^departure[_\s-]?terminal$/i,
  /^return[_\s-]?flight[_\s-]?number$/i,
  /^return[_\s-]?terminal$/i,
  /^vehicle[_\s-]?make$/i,
  /^vehicle[_\s-]?model$/i,
  /^vehicle[_\s-]?colou?r$/i,
  /^contact[_\s-]?number$/i,
  /^phone$/i,
  /^email$/i,
  /^price$/i,
  /^(start|end|arrival|departure|return|entry|exit)[_\s-]?(date|time|datetime)?$/i,
  /^passenger[_\s-]?count$/i,
  /^number[_\s-]?of[_\s-]?people[_\s-]?in[_\s-]?vehicle$/i,
  /^third[_\s-]?party[_\s-]?reference$/i,
  /^transaction[_\s-]?currency$/i,
  /^product[_\s-]?native[_\s-]?currency$/i,
  /^product[_\s-]?native[_\s-]?price$/i,
  /^purchase[_\s-]?model$/i,
  /^deposit[_\s-]?amount$/i,
  /^car[_\s-]?park[_\s-]?balance$/i,
  /^product[_\s-]?name$/i,
  /^booking[_\s-]?item[_\s-]?reference$/i,
];

/**
 * Heuristic: does this row look like a header row? Only ever applied to the FIRST row of the
 * file (the operator can override it in the upload screen); data rows are never dropped by it.
 */
export function looksLikeHeaderRow(row: unknown[] | null | undefined): boolean {
  if (!row || row.length === 0) return false;
  const cells = row.map((c) => cellToCleanString(c).trim()).filter(Boolean);
  if (cells.length === 0) return false;

  const headerMatches = cells.filter((c) => HEADER_PATTERNS.some((p) => p.test(c))).length;
  if (headerMatches >= 2) return true;

  // A header has no dates, times, money or long digit runs.
  const dataLike = cells.filter(
    (s) =>
      /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(s) ||
      /^\d{4}-\d{2}-\d{2}/.test(s) ||
      /\d{1,2}:\d{2}/.test(s) ||
      /^[£$€]?\s?-?\d+([.,]\d+)?$/.test(s) ||
      /\d{5,}/.test(s)
  ).length;
  return dataLike === 0 && cells.length >= 2;
}
