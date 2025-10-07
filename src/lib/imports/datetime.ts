import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

/**
 * Parse flexible date formats including Excel serial numbers
 */
export function parseFlexibleDate(value: string | number | null): string | null {
  if (!value) return null;

  // Handle Excel serial numbers (typically 30000-60000 range)
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const serial = Number(value);
    if (serial > 30000 && serial < 60000) {
      // Excel serial date: 1899-12-30 is day 0, so add the serial number
      const baseDate = new Date(1899, 11, 30);
      baseDate.setDate(baseDate.getDate() + serial);
      return baseDate.toISOString();
    }
  }

  // Handle slash dates (dd/mm/yyyy or mm/dd/yyyy)
  if (typeof value === 'string' && value.includes('/')) {
    const [a, b, c] = value.split('/');
    // Assume dd/mm/yyyy unless the year is clearly in the middle
    if (Number(c) > 1900) {
      return new Date(`${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`).toISOString();
    }
  }

  // Handle ISO or RFC-compliant strings
  const date = new Date(value);
  if (!isNaN(date.getTime())) return date.toISOString();

  return null;
}

export type Tz = "UTC" | "Europe/London";

export type DateParseOptions = {
  /** two-digit year pivot: <= pivot → 2000+yy, > pivot → 1900+yy */
  twoDigitPivot?: number;           // default 69
  /** reject years outside this range to avoid 1957, 2094 etc. */
  validYearMin?: number;            // default 2015
  validYearMax?: number;            // default 2035
};

function yyToFull(yy: string, pivot = 69) {
  const y = parseInt(yy, 10);
  return y <= pivot ? 2000 + y : 1900 + y;
}

function parseDDMMYYDigits(s: string, opts: DateParseOptions) {
  let t = s.replace(/\D/g, "");
  if (t.length === 5) t = "0" + t;           // Excel dropped leading zero
  if (t.length !== 6) return null;

  const dd = parseInt(t.slice(0, 2), 10);
  const mm = parseInt(t.slice(2, 4), 10);
  const yy = t.slice(4, 6);

  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;

  const fullY = yyToFull(yy, opts.twoDigitPivot ?? 69);
  if ((opts.validYearMin ?? 2015) > fullY) return null;
  if ((opts.validYearMax ?? 2035) < fullY) return null;

  const d = dayjs(`${fullY}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
  return d.isValid() ? d : null;
}

export function parseDateFlex(dateCell?: string, opts: DateParseOptions = {}) {
  const v = (dateCell ?? "").toString().trim();
  if (!v) return null;

  // First try the flexible date parser for Excel serials and common formats
  const flexibleResult = parseFlexibleDate(v);
  if (flexibleResult) {
    const d = dayjs(flexibleResult);
    const y = d.year();
    if (d.isValid() && (opts.validYearMin ?? 2015) <= y && y <= (opts.validYearMax ?? 2035)) {
      return d;
    }
  }

  // 1) ddmmyy (5/6 digits) for cases not caught by flexible parser
  const ddmmyy = parseDDMMYYDigits(v, opts);
  if (ddmmyy) return ddmmyy;

  // 2) dd/mm/yy or dd/mm/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(v)) {
    const [d1, m1, y1] = v.split("/");
    const fullY = y1.length === 2 ? yyToFull(y1, opts.twoDigitPivot ?? 69) : parseInt(y1, 10);
    if ((opts.validYearMin ?? 2015) <= fullY && fullY <= (opts.validYearMax ?? 2035)) {
      const d = dayjs(`${fullY}-${m1.padStart(2, "0")}-${d1.padStart(2, "0")}`);
      if (d.isValid()) return d;
    }
  }

  // 3) ISO date/ts (YYYY-MM-DD or YYYY-MM-DDTHH:mm…)
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = dayjs(v);
    const y = d.year();
    if (d.isValid() && (opts.validYearMin ?? 2015) <= y && y <= (opts.validYearMax ?? 2035)) return d;
  }

  return null;
}

export function parseDateCell(v?: string): dayjs.Dayjs | null {
  return parseDateFlex(v);
}

export function parseTimeCell(v?: string): {h: number, m: number} {
  const s = (v || "").trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) {
    return { h: Number(s.slice(0,2)), m: Number(s.slice(3,5)) };
  }
  return { h: 0, m: 0 };
}

export function composeISO(
  dateStr?: string,
  timeStr?: string,
  tz: Tz = "Europe/London",
  opts: DateParseOptions = {}
) {
  const d = parseDateFlex(dateStr, opts);
  if (!d) return "";
  let hh = 0, mm = 0;
  if (timeStr && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr.trim())) {
    const [h, m] = timeStr.split(":");
    hh = Number(h); mm = Number(m);
  }
  const local = d.hour(hh).minute(mm).second(0).millisecond(0);
  return tz === "UTC" ? local.utc().toISOString() : local.utc(true).toISOString();
}