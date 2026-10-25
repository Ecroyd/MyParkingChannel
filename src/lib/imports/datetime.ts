/**
 * Date/time parsing for the admin manual CSV/XLSX booking import.
 *
 * Rules (UK car parks):
 * - Slash/dash/dot dates are ALWAYS day-first (DD/MM/YYYY). Never `new Date(ambiguousString)`.
 * - YYYY-MM-DD (optionally with a time) and ISO strings are accepted.
 * - Excel serials (date, date+time, or a time fraction such as 0.375 = 09:00) are converted
 *   with pure arithmetic, so the result never depends on the browser's timezone.
 * - Output is a NAIVE tenant-local wall-clock string "YYYY-MM-DDTHH:mm:ss" (no Z). The commit
 *   route converts it to UTC with the tenant timezone (Europe/London), which handles BST/GMT.
 * - Invalid calendar dates (31/02/2026, month 13) are reported as errors, never rolled over.
 */
import { formatInTimeZone } from "date-fns-tz";

export type DateParseOptions = {
  /** two-digit year pivot: <= pivot → 2000+yy, > pivot → 1900+yy */
  twoDigitPivot?: number; // default 69
  /** reject years outside this range to avoid 1957, 2094 etc. */
  validYearMin?: number; // default 2015
  validYearMax?: number; // default 2035
  /** Timezone used only when a value carries an explicit UTC offset (e.g. +01:00). */
  timezone?: string; // default Europe/London
};

export type LocalDate = { y: number; m: number; d: number };
export type LocalTime = { h: number; mi: number; s: number };
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export type CellValue = string | number | null | undefined;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 0;
}

function fullYear(yRaw: string, pivot: number) {
  if (yRaw.length === 2) {
    const yy = parseInt(yRaw, 10);
    return yy <= pivot ? 2000 + yy : 1900 + yy;
  }
  return parseInt(yRaw, 10);
}

function validateDate(y: number, m: number, d: number, opts: DateParseOptions, raw: string): Parsed<LocalDate> {
  if (m < 1 || m > 12) return { ok: false, error: `invalid month ${m} in "${raw}" (dates must be DD/MM/YYYY)` };
  if (d < 1 || d > daysInMonth(y, m)) return { ok: false, error: `invalid day ${d} for ${pad(m)}/${y} in "${raw}"` };
  const min = opts.validYearMin ?? 2015;
  const max = opts.validYearMax ?? 2035;
  if (y < min || y > max) return { ok: false, error: `year ${y} out of range ${min}-${max} in "${raw}"` };
  return { ok: true, value: { y, m, d } };
}

function validateTime(h: number, mi: number, s: number, raw: string): Parsed<LocalTime> {
  if (!(h >= 0 && h <= 23) || !(mi >= 0 && mi <= 59) || !(s >= 0 && s <= 59)) {
    return { ok: false, error: `invalid time "${raw}"` };
  }
  return { ok: true, value: { h, mi, s } };
}

/**
 * Excel serial (days since 1899-12-30, fraction = time of day) → wall-clock parts.
 * Pure arithmetic in UTC, rounded to the nearest second, so no timezone drift.
 */
export function excelSerialToParts(serial: number): { date: LocalDate; time: LocalTime } | null {
  if (!Number.isFinite(serial) || serial < 0) return null;
  const totalSeconds = Math.round(serial * 86400);
  const days = Math.floor(totalSeconds / 86400);
  const secs = totalSeconds - days * 86400;
  const dt = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
  return {
    date: { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() },
    time: { h: Math.floor(secs / 3600), mi: Math.floor((secs % 3600) / 60), s: secs % 60 },
  };
}

/** Parse a time-of-day string/number. Returns null for empty input. */
export function parseTimeValue(v: CellValue): Parsed<LocalTime> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return { ok: false, error: `invalid time "${v}"` };
    if (Number.isInteger(v)) {
      // 930 / 1430 typed into Excel as a number = HHmm
      if (v > 0 && v <= 2359) return validateTime(Math.floor(v / 100), v % 100, 0, String(v));
      // 0 = midnight; a larger integer is a date-only serial (no time part)
      return { ok: true, value: { h: 0, mi: 0, s: 0 } };
    }
    // Excel time fraction (0.375 = 09:00); a full date-time serial keeps only its time part.
    let secs = Math.round((v - Math.floor(v)) * 86400);
    if (secs >= 86400) secs = 86399;
    return { ok: true, value: { h: Math.floor(secs / 3600), mi: Math.floor((secs % 3600) / 60), s: secs % 60 } };
  }

  const raw = String(v).trim();
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/\s+/g, " ");

  // 12-hour: "9:15 PM", "9:15pm", "9pm", "9.15 pm", "09:15:30 am", "9:15 p.m."
  let m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(?::(\d{2}))? ?([ap])\.?m\.?$/);
  if (m) {
    const h12 = Number(m[1]);
    if (h12 < 1 || h12 > 12) return { ok: false, error: `invalid 12-hour time "${raw}"` };
    const h = (h12 % 12) + (m[4] === "p" ? 12 : 0);
    return validateTime(h, Number(m[2] ?? 0), Number(m[3] ?? 0), raw);
  }

  // 24-hour: "H:mm", "HH:mm", "HH:mm:ss", "HH:mm:ss.SSS"
  m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (m) return validateTime(Number(m[1]), Number(m[2]), Number(m[3] ?? 0), raw);

  // "9.30" / "21.15" (exactly two minute digits → unambiguous H.mm)
  m = s.match(/^(\d{1,2})\.(\d{2})$/);
  if (m) return validateTime(Number(m[1]), Number(m[2]), 0, raw);

  // "0930" / "930" (HHmm)
  m = s.match(/^(\d{1,2})(\d{2})$/);
  if (m) return validateTime(Number(m[1]), Number(m[2]), 0, raw);

  // Excel time fraction / date-time serial written out as text, e.g. "0.375" or "46320.3958"
  if (/^\d*\.\d{3,}$/.test(s)) return parseTimeValue(Number(s));

  return { ok: false, error: `unrecognised time "${raw}"` };
}

export type ParsedDateTime = { date: LocalDate; time: LocalTime | null };

/**
 * Parse a date cell, which may also carry a time ("25/10/2026 09:30", ISO, Excel serial).
 * Returns null for empty input.
 */
export function parseDateValue(v: CellValue, opts: DateParseOptions = {}): Parsed<ParsedDateTime> | null {
  if (v === null || v === undefined) return null;
  const pivot = opts.twoDigitPivot ?? 69;

  if (typeof v === "number") {
    const serial = parseNumericDate(v, String(v), opts);
    if (serial.ok || !Number.isInteger(v)) return serial;
    // ddmmyy typed into Excel as a number (leading zero lost)
    return parseCompactDigits(String(v), opts) ?? serial;
  }

  const raw = String(v).trim();
  if (!raw) return null;

  // Pure number in text form: Excel serial ("46320", "46320.375") or compact digits.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    if (/^\d{5,6}$/.test(raw) || /^\d{8}$/.test(raw)) {
      const serial = /^\d{5}$/.test(raw) ? parseNumericDate(Number(raw), raw, opts) : null;
      if (serial?.ok) return serial;
      const compact = parseCompactDigits(raw, opts);
      if (compact) return compact;
      return serial ?? { ok: false, error: `unrecognised date "${raw}"` };
    }
    return parseNumericDate(Number(raw), raw, opts);
  }

  const splitTime = (rest: string | undefined): Parsed<LocalTime | null> => {
    const t = (rest ?? "").replace(/^[,T\s]+/, "").trim();
    if (!t) return { ok: true, value: null };
    const pt = parseTimeValue(t);
    if (!pt) return { ok: true, value: null };
    return pt;
  };

  // ISO / YYYY-MM-DD[ T]HH:mm[:ss[.SSS]][Z|±hh:mm] (also YYYY/MM/DD)
  let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s]+(\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2})?)?$/i);
  if (m) {
    const [, y, mo, d, time, offset] = m;
    if (offset && offset.toUpperCase() !== "Z") {
      // Explicit offset = absolute instant; express it in tenant wall-clock time.
      const inst = new Date(`${y}-${pad(+mo)}-${pad(+d)}T${time}${offset.length === 5 ? offset.slice(0, 3) + ":" + offset.slice(3) : offset}`);
      if (isNaN(inst.getTime())) return { ok: false, error: `invalid date "${raw}"` };
      const local = formatInTimeZone(inst, opts.timezone ?? "Europe/London", "yyyy-MM-dd'T'HH:mm:ss");
      return parseDateValue(local, opts);
    }
    // A bare "Z" is treated as supplier-local wall-clock time (same convention as
    // sanitizeSupplierDateTimeInput on the server).
    const dv = validateDate(+y, +mo, +d, opts, raw);
    if (!dv.ok) return dv;
    const tv = splitTime(time);
    if (!tv.ok) return tv;
    return { ok: true, value: { date: dv.value, time: tv.value } };
  }

  // UK day-first: DD/MM/YYYY, DD-MM-YY, DD.MM.YYYY, optionally followed by a time.
  m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:(?:[,T]|\s)+(.+))?$/i);
  if (m) {
    const [, d, mo, y, rest] = m;
    const dv = validateDate(fullYear(y, pivot), +mo, +d, opts, raw);
    if (!dv.ok) return dv;
    const tv = splitTime(rest);
    if (!tv.ok) return { ok: false, error: `${tv.error} in "${raw}"` };
    return { ok: true, value: { date: dv.value, time: tv.value } };
  }

  // "25 Oct 2026", "25-Oct-26", "Sun 25 October 2026 09:30", "25th Oct 2026"
  m = raw.match(/^(?:[a-z]{3,9},?\s+)?(\d{1,2})(?:st|nd|rd|th)?[\s/-]+([a-z]{3,9})\.?[\s/-]+(\d{2}|\d{4})(?:(?:[,T]|\s)+(.+))?$/i);
  if (m) {
    const [, d, monName, y, rest] = m;
    const mo = MONTHS[monName.toLowerCase().slice(0, monName.toLowerCase().startsWith("sept") ? 4 : 3)];
    if (!mo) return { ok: false, error: `unrecognised month "${monName}" in "${raw}"` };
    const dv = validateDate(fullYear(y, pivot), mo, +d, opts, raw);
    if (!dv.ok) return dv;
    const tv = splitTime(rest);
    if (!tv.ok) return { ok: false, error: `${tv.error} in "${raw}"` };
    return { ok: true, value: { date: dv.value, time: tv.value } };
  }

  return { ok: false, error: `unrecognised date "${raw}" (expected DD/MM/YYYY)` };
}

function parseNumericDate(n: number, raw: string, opts: DateParseOptions): Parsed<ParsedDateTime> {
  const parts = excelSerialToParts(n);
  if (!parts || n < 1) return { ok: false, error: `unrecognised date "${raw}"` };
  const dv = validateDate(parts.date.y, parts.date.m, parts.date.d, opts, raw);
  if (!dv.ok) return { ok: false, error: `unrecognised date "${raw}"` };
  const hasTime = n % 1 !== 0;
  return { ok: true, value: { date: dv.value, time: hasTime ? parts.time : null } };
}

/** ddmmyy (Excel may drop the leading zero → 5 digits), ddmmyyyy or yyyymmdd. */
function parseCompactDigits(raw: string, opts: DateParseOptions): Parsed<ParsedDateTime> | null {
  const pivot = opts.twoDigitPivot ?? 69;
  let t = raw;
  if (t.length === 5) t = "0" + t;
  const candidates: Parsed<LocalDate>[] = [];
  if (t.length === 6) {
    candidates.push(validateDate(fullYear(t.slice(4, 6), pivot), +t.slice(2, 4), +t.slice(0, 2), opts, raw));
  } else if (t.length === 8) {
    candidates.push(validateDate(+t.slice(4, 8), +t.slice(2, 4), +t.slice(0, 2), opts, raw)); // DDMMYYYY
    candidates.push(validateDate(+t.slice(0, 4), +t.slice(4, 6), +t.slice(6, 8), opts, raw)); // YYYYMMDD
  }
  const good = candidates.filter((c): c is { ok: true; value: LocalDate } => c.ok);
  if (good.length === 1) return { ok: true, value: { date: good[0].value, time: null } };
  return null;
}

export function formatNaiveLocal(date: LocalDate, time: LocalTime | null): string {
  const t = time ?? { h: 0, mi: 0, s: 0 };
  return `${pad(date.y, 4)}-${pad(date.m)}-${pad(date.d)}T${pad(t.h)}:${pad(t.mi)}:${pad(t.s)}`;
}

/**
 * Combine a date cell (which may include a time) and an optional time cell into a naive
 * tenant-local "YYYY-MM-DDTHH:mm:ss". A non-empty time cell wins over a time embedded in
 * the date cell. An empty time gives 00:00. Unparseable values are errors.
 */
export function composeLocalDateTime(
  dateCell: CellValue,
  timeCell?: CellValue,
  opts: DateParseOptions = {}
): Parsed<string> {
  const pd = parseDateValue(dateCell, opts);
  if (!pd) return { ok: false, error: "missing date" };
  if (!pd.ok) return pd;
  const pt = parseTimeValue(timeCell);
  if (pt && !pt.ok) return pt;
  const time = pt?.ok ? pt.value : pd.value.time;
  return { ok: true, value: formatNaiveLocal(pd.value.date, time) };
}
