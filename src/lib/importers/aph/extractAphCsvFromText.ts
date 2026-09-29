/**
 * Helpers for extracting APH positional CSV from email bodies
 * (common when staff forward APH booking emails and the attachment is inlined).
 */

/** A quoted APH data line typically starts with "0…" and includes a status token. */
const APH_LINE_RE =
  /^\s*"0[^"]*"\s*,\s*"(?:NEW|AMENDED?|CANCELLED?|CANX|\*?CANX\*?|FIRM)[^"]*"\s*,/i;

/**
 * Pull APH CSV rows out of free-form email text.
 * Returns null when no APH rows are found.
 */
export function extractAphCsvFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const lines = String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  const aphLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (APH_LINE_RE.test(trimmed) || looksLikeAphCsvLine(trimmed)) {
      aphLines.push(trimmed);
    }
  }

  if (aphLines.length === 0) return null;
  return aphLines.join("\n");
}

/** Heuristic: quoted positional CSV with enough columns and a UK date in the start-date slot. */
function looksLikeAphCsvLine(line: string): boolean {
  if (!line.includes('"') || !line.includes(",")) return false;
  // Count quoted fields roughly
  const fields = line.match(/"(?:[^"]|"")*"/g);
  if (!fields || fields.length < 20) return false;
  // Start date is typically field index 4 → "dd/mm/yy"
  const startDateField = fields[4]?.replace(/^"|"$/g, "").trim() ?? "";
  if (!/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(startDateField)) return false;
  // Ref field (index 2) should be non-empty alphanumeric-ish
  const ref = fields[2]?.replace(/^"|"$/g, "").trim() ?? "";
  return ref.length >= 3;
}

export function textLooksLikeAphCsv(text: string | null | undefined): boolean {
  return extractAphCsvFromText(text) != null;
}
