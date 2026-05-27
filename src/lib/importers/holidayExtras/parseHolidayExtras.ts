import type { CanonicalBooking } from "../canonical/types";
import {
  mapSupplierStatusToBookingStatus,
  normalizeSupplierStatus,
} from "@/lib/ingest/importStatusMapping";

const trim = (v: unknown) => String(v ?? "").trim().replace(/^"|"$/g, "");

/** Allow EXT1, EXT2, etc. */
const EXT_VARIANT = /^EXT\d+$/i;
/** Holiday Extras booking refs are typically 6 alphanumeric chars with at least one letter. */
function isLikelyBookingRef(value: string): boolean {
  const t = trim(value).toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(t)) return false;
  if (/^\d{6}$/.test(t)) return false;
  if (!/[A-Z]/.test(t)) return false;
  return true;
}
const STATUS_PATTERN = /\*?(FIRM|AMND|CANX|NEW|CANCELLED)\*?/i;

export type HolidayExtrasParseStats = {
  total_lines: number;
  ext_rows_found: number;
  rows_accepted: number;
  skipped_missing_reference: number;
  skipped_missing_status: number;
  skipped_invalid_date: number;
  skipped_unknown_format: number;
};

export type HolidayExtrasParseResult = {
  bookings: CanonicalBooking[];
  stats: HolidayExtrasParseStats;
};

function parseDMY6(dmy6: string) {
  const s = trim(dmy6);
  const m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  return { dd: m[1], mm: m[2], yyyy: `20${m[3]}` };
}

function toIsoFromParts(
  yyyy: string,
  mm: string,
  dd: string,
  hm: string
): string | null {
  const t = trim(hm).replace(/\./g, ":");
  const time =
    t.length === 4 && !t.includes(":")
      ? `${t.slice(0, 2)}:${t.slice(2, 4)}`
      : t || "00:00";
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${time}:00.000Z`;
}

function toIsoFromDMY6_HM(dmy6: string, hm: string) {
  const d = parseDMY6(dmy6);
  if (!d) return null;
  return toIsoFromParts(d.yyyy, d.mm, d.dd, hm);
}

/** Parse arrival/return date + time from common Holiday Extras encodings. */
export function parseExtDateTime(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined
): string | null {
  const d = trim(dateStr ?? "");
  const t = trim(timeStr ?? "");
  if (!d) return null;

  let iso = toIsoFromDMY6_HM(d, t || "00:00");
  if (iso) return iso;

  if (d.includes("/") || d.includes("-")) {
    const parts = d.split(/[/-]/).map((p) => p.trim());
    if (parts.length === 3) {
      const [dd, mm, yy] = parts;
      const yyyy = yy.length === 2 ? `20${yy}` : yy;
      iso = toIsoFromParts(yyyy, mm, dd, t || "00:00");
      if (iso) return iso;
    }
  }

  if (/^\d{8}$/.test(d)) {
    const dd = d.slice(0, 2);
    const mm = d.slice(2, 4);
    const yyyy = d.slice(4, 8);
    return toIsoFromParts(yyyy, mm, dd, t || "00:00");
  }

  return null;
}

function parseMoney(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Split EXT line on tabs or 2+ spaces (some exports are space-padded). */
export function splitExtLine(line: string): string[] {
  const cleaned = line.replace(/^\uFEFF/, "").trimEnd();
  if (cleaned.includes("\t")) {
    return cleaned.split("\t").map((c) => trim(c));
  }
  if (/\s{2,}/.test(cleaned)) {
    return cleaned.split(/\s{2,}/).map((c) => trim(c));
  }
  return cleaned.split(/\s+/).map((c) => trim(c));
}

/**
 * Column offset for standard EXT1 layout:
 * offset 0 → col0=N, col1=EXT1, col2=ref
 * offset -1 → col0=EXT1, col1=ref
 */
export function resolveExtOffset(cols: string[]): number | null {
  const c0 = trim(cols[0]);
  const c1 = trim(cols[1]);
  if (EXT_VARIANT.test(c1)) return 0;
  if (EXT_VARIANT.test(c0) && isLikelyBookingRef(c1)) return -1;
  for (let i = 2; i < Math.min(4, cols.length); i++) {
    if (EXT_VARIANT.test(trim(cols[i]))) return i - 1;
  }
  return null;
}

function fieldAt(cols: string[], index: number, offset: number): string {
  const idx = index + offset;
  if (idx < 0 || idx >= cols.length) return "";
  return trim(cols[idx]);
}

function findReference(cols: string[], offset: number, line: string): string | null {
  const fromField = fieldAt(cols, 2, offset);
  if (fromField && isLikelyBookingRef(fromField)) {
    return fromField.toUpperCase();
  }
  for (const c of cols) {
    const t = trim(c);
    if (isLikelyBookingRef(t) && !EXT_VARIANT.test(t)) {
      return t.toUpperCase();
    }
  }
  const m = line.match(/\b([A-Z]{6})\b/g);
  if (m) {
    const ref = m.find((r) => !EXT_VARIANT.test(r) && isLikelyBookingRef(r));
    if (ref) return ref.toUpperCase();
  }
  return null;
}

function findStatusToken(cols: string[], offset: number, line: string): string | null {
  const fromField = fieldAt(cols, 10, offset);
  if (fromField && STATUS_PATTERN.test(fromField)) {
    return fromField;
  }
  for (const c of cols) {
    if (STATUS_PATTERN.test(c)) return c;
  }
  const m = line.match(STATUS_PATTERN);
  return m ? m[0] : null;
}

function hasExtMarker(text: string): boolean {
  return (
    text.includes("\tEXT1\t") ||
    /\tEXT\d+\t/i.test(text) ||
    /^EXT\d+\t/im.test(text) ||
    /\bEXT\d+\b/i.test(text)
  );
}

export function looksLikeExt1Tsv(text: string): boolean {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return false;

  const sample = lines.slice(0, Math.min(lines.length, 25));
  const extRows = sample
    .map((l) => splitExtLine(l))
    .filter((cols) => cols.length >= 10 && resolveExtOffset(cols) !== null).length;

  return extRows >= Math.max(1, Math.ceil(sample.length * 0.3));
}

export function isHolidayExtrasFile(filename: string, text: string): boolean {
  if (looksLikeExt1Tsv(text)) return true;
  const name = filename.toLowerCase();
  if (/^ext\d+.*\.txt$/i.test(name)) return true;
  return (
    hasExtMarker(text) &&
    (text.includes("*FIRM*") ||
      text.includes("*AMND*") ||
      text.includes("*CANX*") ||
      /\bFIRM\b/i.test(text) ||
      /\bCANX\b/i.test(text))
  );
}

function emptyStats(totalLines: number): HolidayExtrasParseStats {
  return {
    total_lines: totalLines,
    ext_rows_found: 0,
    rows_accepted: 0,
    skipped_missing_reference: 0,
    skipped_missing_status: 0,
    skipped_invalid_date: 0,
    skipped_unknown_format: totalLines,
  };
}

export function formatHolidayExtrasParseReason(stats: HolidayExtrasParseStats): string {
  return [
    `total_rows=${stats.total_lines}`,
    `ext_rows=${stats.ext_rows_found}`,
    `accepted=${stats.rows_accepted}`,
    `skipped_missing_reference=${stats.skipped_missing_reference}`,
    `skipped_missing_status=${stats.skipped_missing_status}`,
    `skipped_invalid_date=${stats.skipped_invalid_date}`,
    `skipped_unknown_format=${stats.skipped_unknown_format}`,
  ].join("; ");
}

export function parseHolidayExtrasText(text: string): HolidayExtrasParseResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
  const stats = emptyStats(lines.length);
  const bookings: CanonicalBooking[] = [];

  for (const line of lines) {
    const f = splitExtLine(line);
    const offset = resolveExtOffset(f);

    if (offset === null) {
      stats.skipped_unknown_format++;
      continue;
    }

    stats.ext_rows_found++;

    const bookingRef = findReference(f, offset, line);
    const statusToken = findStatusToken(f, offset, line);
    const supplierToken = normalizeSupplierStatus(statusToken);

    if (!bookingRef) {
      stats.skipped_missing_reference++;
      continue;
    }

    if (!supplierToken && !statusToken) {
      stats.skipped_missing_status++;
      continue;
    }

    const arrivalDate = fieldAt(f, 8, offset);
    const arrivalTime = fieldAt(f, 7, offset);
    const returnDate = fieldAt(f, 13, offset);
    const returnTime = fieldAt(f, 14, offset);

    let startAt = parseExtDateTime(arrivalDate, arrivalTime);
    let endAt = parseExtDateTime(returnDate, returnTime);

    if (!startAt) {
      stats.skipped_invalid_date++;
      continue;
    }

    if (!endAt) {
      const startMs = new Date(startAt).getTime();
      endAt = new Date(startMs + 60 * 60 * 1000).toISOString();
    }

    const surname = fieldAt(f, 3, offset) || null;
    const firstInitial = fieldAt(f, 5, offset) || null;
    const money_received = parseMoney(fieldAt(f, 11, offset));
    const money_charged = parseMoney(fieldAt(f, 12, offset));
    const total_price = money_charged ?? money_received ?? 0;

    const phone = fieldAt(f, 21, offset) || fieldAt(f, 22, offset) || null;
    const outboundFlight = fieldAt(f, 20, offset) || null;
    const returnFlight = fieldAt(f, 25, offset) || null;

    const vehicleRegRaw = fieldAt(f, 15, offset);
    const vehicleReg =
      vehicleRegRaw && vehicleRegRaw !== "-" && vehicleRegRaw.trim() !== ""
        ? vehicleRegRaw.trim()
        : null;

    const mappedStatus = mapSupplierStatusToBookingStatus(supplierToken);

    bookings.push({
      channel: "HOLIDAY_EXTRAS" as const,
      booking_reference: bookingRef,
      third_party_reference: null,
      start_at: startAt,
      end_at: endAt,
      vehicle_registration: vehicleReg,
      vehicle_make: fieldAt(f, 18, offset) || null,
      vehicle_model: fieldAt(f, 19, offset) || null,
      vehicle_colour: fieldAt(f, 17, offset) || null,
      customer_firstname: firstInitial,
      customer_lastname: surname,
      customer_email: null,
      customer_phone: phone,
      outbound_flight_number: outboundFlight,
      return_flight_number: returnFlight,
      total_price,
      money_received: money_received ?? 0,
      money_charged: money_charged ?? 0,
      currency: "GBP",
      raw: {
        fields: f,
        external_status: supplierToken ?? statusToken,
        mapped_status: mappedStatus,
      },
    });
    stats.rows_accepted++;
  }

  stats.skipped_unknown_format = Math.max(
    0,
    stats.total_lines - stats.ext_rows_found
  );

  return { bookings, stats };
}
