/** Expand strings like "4.47816E+11" into full digits "447816000000". */
export function expandSciToDigits(val?: string) {
  const s = String(val ?? "").trim();
  if (!/[eE][+\-]?\d+/.test(s)) return s; // not scientific
  const m = s.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+\-]?\d+)$/);
  if (!m) return s;
  const sign = m[1] || "";
  const intPart = m[2];
  const fracPart = m[3] || "";
  const exp = parseInt(m[4], 10);
  if (isNaN(exp)) return s;

  if (exp >= 0) {
    // move decimal right
    if (exp >= fracPart.length) {
      return sign + intPart + fracPart + "0".repeat(exp - fracPart.length);
    } else {
      return sign + intPart + fracPart.slice(0, exp);
    }
  } else {
    // move decimal left (rare for phones, supported anyway)
    const shift = Math.abs(exp);
    return sign + "0." + "0".repeat(shift - 1) + intPart + fracPart;
  }
}

/** Convert any cell to a clean string without sci-notation. */
export function cellToCleanString(cell: any) {
  if (cell == null) return "";
  if (typeof cell === "number") {
    // JS won't use scientific notation for ~1e11; convert directly
    return String(cell);
  }
  const s = String(cell);
  return expandSciToDigits(s);
}

/** Normalise to UK +44, handling 0044/44/07 and expanded sci-notation. */
export function normalisePhoneUK(raw?: string) {
  let s = cellToCleanString(raw);
  // strip everything except digits and leading +
  s = s.replace(/(?!^\+)[^\d]/g, "");
  if (s.startsWith("+44")) return s;
  if (s.startsWith("0044")) return "+44" + s.slice(4);
  if (s.startsWith("44")) return "+44" + s.slice(2);
  if (/^07\d{9}$/.test(s)) return "+44" + s.slice(1);
  if (/^0\d{9,}$/.test(s)) return "+44" + s.slice(1);
  // last resort: if it's at least 10 digits, make it a "+" number to avoid Excel munging later
  if (/^\d{10,}$/.test(s)) return "+" + s;
  return s;
}

/** Column letter (A, B, AA) or plain index ("0") → zero-based index */
export function colLetterToIndex(letterOrIndex: string) {
  const s = (letterOrIndex || "").trim().toUpperCase();
  if (!s) return -1;
  if (/^\d+$/.test(s)) return Number(s);
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n - 1;
}

export function getCell(row: any[], letterOrIndex?: string): string {
  const idx = colLetterToIndex(letterOrIndex ?? "");
  if (idx < 0) return "";
  const val = row[idx];
  return cellToCleanString(val).trim();
}
