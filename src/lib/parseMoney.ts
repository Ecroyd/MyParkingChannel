/**
 * Parse a money amount from supplier files, CSV uploads and emails into pounds (2dp).
 * Handles "£12.50", "GBP 12.50", "12.50 GBP", "1,234.50", "&pound;", the mojibake "Â£" a UTF-8 £
 * becomes when a CSV is read as Latin-1, and European "12,50" / "1.234,50" (decimal comma).
 * Returns null (never 0) when nothing numeric is present, so callers can tell "missing" from £0.
 */
export function parseMoney(input: unknown): number | null {
  if (input === undefined || input === null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? round2(input) : null;

  let s = String(input)
    .replace(/&pound;|Â£|£|GBP|gbp| /g, ' ')
    .replace(/\s+/g, '')
    .trim();
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  }

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal point.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "12,50" (decimal comma) vs "1,234" / "12,345,678" (thousands).
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const value = Number(s);
  if (!Number.isFinite(value)) return null;
  return round2(negative ? -value : value);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
