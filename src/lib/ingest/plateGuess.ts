const PLATE_BLOCKLIST = new Set([
  "BOOKING",
  "RECEIPT",
  "PAYMENT",
  "SUCCESSFUL",
  "CONFIRMATION",
  "FLYPARKS",
  "VEHICLE",
  "DETAILS",
  "REFERENCE",
  "PARKING",
  "TOTAL",
  "COST",
]);

/** UK VRM patterns — current (AA99AAA) and common legacy shapes. */
export function isPlausibleUkVrm(value: string): boolean {
  const norm = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (norm.length < 5 || norm.length > 8) return false;
  if (PLATE_BLOCKLIST.has(norm)) return false;

  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(norm)) return true;
  if (/^[A-Z]{1,3}\d{1,4}[A-Z]{1,3}$/.test(norm)) return true;
  if (/^\d{1,4}[A-Z]{1,3}$/.test(norm)) return true;
  if (/^[A-Z]{1,3}\d{1,4}$/.test(norm)) return true;

  return false;
}

export function normalizeUkPlate(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate =
    value.match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3})\b/i)?.[0] ??
    value.match(/\b([A-Z0-9]{5,8})\b/i)?.[1] ??
    value;
  const norm = candidate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return isPlausibleUkVrm(norm) ? norm : null;
}

const LABEL_PATTERNS: RegExp[] = [
  /Vehicle\s+Details:\s*[^\n]*/i,
  /Vehicle\s+Registration:\s*([^\n]+)/i,
  /Registration\s+Number:\s*([^\n]+)/i,
  /\bReg:\s*([^\n]+)/i,
];

/**
 * Guess a UK plate from email/receipt text.
 * Prefers explicit labels; ignores common receipt words (BOOKING, RECEIPT, etc.).
 */
export function guessPlateFromEmailText(text: string): string | null {
  for (const re of LABEL_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;

    if (/vehicle\s+details/i.test(re.source)) {
      const line = m[0].replace(/^Vehicle\s+Details:\s*/i, "").trim();
      const tokens = line.split(/\s+/).filter(Boolean);
      for (let i = tokens.length - 1; i >= 0; i--) {
        const plate = normalizeUkPlate(tokens[i]);
        if (plate) return plate;
      }
      continue;
    }

    const plate = normalizeUkPlate(m[1]);
    if (plate) return plate;
  }

  const ukFormat = text.match(/\b([A-Z]{2}\d{2}[A-Z]{3})\b/gi) ?? [];
  for (const token of ukFormat) {
    const plate = normalizeUkPlate(token);
    if (plate) return plate;
  }

  return null;
}
