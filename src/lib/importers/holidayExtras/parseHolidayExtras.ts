import type { CanonicalBooking } from "../canonical/types";
import {
  mapSupplierStatusToBookingStatus,
  normalizeSupplierStatus,
} from "@/lib/ingest/importStatusMapping";
import { parseNaiveLocalIsoToUtc } from "@/lib/datetime/parse";

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

function parseYYMMDD(yymmdd: string): Date | null {
  const s = trim(yymmdd);
  const m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const yy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const date = new Date(Date.UTC(2000 + yy, mm - 1, dd));
  if (
    date.getUTCFullYear() !== 2000 + yy ||
    date.getUTCMonth() !== mm - 1 ||
    date.getUTCDate() !== dd
  ) {
    return null;
  }
  return date;
}

function formatUtcDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function toLocalIsoFromYYMMDD(
  yymmdd: string,
  hm: string,
  addDays = 0
): string | null {
  const date = parseYYMMDD(yymmdd);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + addDays);
  const t = trim(hm);
  if (!/^\d{3,4}$/.test(t)) return null;
  const padded = t.padStart(4, "0");
  const hour = padded.slice(0, 2);
  const minute = padded.slice(2, 4);
  if (Number(hour) > 23 || Number(minute) > 59) return null;
  return `${formatUtcDate(date)}T${hour}:${minute}:00`;
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
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${time}:00`;
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

function normalizeReg(v: string | null | undefined): string | null {
  const reg = trim(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return reg || null;
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

export function looksLikeExtz10Tab(filename: string, text: string): boolean {
  if (filename.toLowerCase().includes("extz10")) return true;
  const first = text.replace(/\r\n/g, "\n").split("\n").find((l) => l.trim() !== "");
  if (!first || !first.includes("\t")) return false;
  const f = splitExtLine(first);
  return f[0] === "06" && f.length >= 23 && /^[123]$/.test(f[1] ?? "");
}

export function isHolidayExtrasFile(filename: string, text: string): boolean {
  if (looksLikeExtz10Tab(filename, text)) return true;
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

function actionToStatus(action: string): {
  status: "reserved" | "cancelled";
  external_status: "new" | "amended" | "cancelled";
} | null {
  switch (trim(action)) {
    case "1":
      return { status: "reserved", external_status: "new" };
    case "2":
      return { status: "reserved", external_status: "amended" };
    case "3":
      return { status: "cancelled", external_status: "cancelled" };
    default:
      return null;
  }
}

export function parseHolidayExtrasExtz10Text(text: string): HolidayExtrasParseResult {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
  const stats = emptyStats(lines.length);
  const bookings: CanonicalBooking[] = [];

  for (const line of lines) {
    const f = splitExtLine(line);
    if (f[0] !== "06" || f.length < 23) {
      stats.skipped_unknown_format++;
      continue;
    }

    stats.ext_rows_found++;
    const action = actionToStatus(f[1]);
    const ref = trim(f[2]).toUpperCase();
    if (!ref) {
      stats.skipped_missing_reference++;
      continue;
    }
    if (!action) {
      stats.skipped_missing_status++;
      continue;
    }

    const startAt = toLocalIsoFromYYMMDD(f[4], f[8], 1);
    const endAt = toLocalIsoFromYYMMDD(f[9], f[15], 0);
    if (!startAt) {
      stats.skipped_invalid_date++;
      continue;
    }

    const price = parseMoney(f[12]) ?? 0;
    const title = trim(f[5]);
    const initial = trim(f[6]);
    const lastName = trim(f[3]);
    const customerName = [title, initial, lastName].filter(Boolean).join(" ") || null;
    const vehicleReg = normalizeReg(f[17]);
    const rawFields = Object.fromEntries(f.map((value, index) => [String(index), value]));

    bookings.push({
      channel: "HOLIDAY_EXTRAS_EXTZ10",
      booking_reference: ref,
      third_party_reference: ref,
      start_at: startAt,
      end_at: endAt ?? startAt,
      vehicle_registration: vehicleReg,
      vehicle_make: trim(f[19]) || null,
      vehicle_model: trim(f[20]) || null,
      vehicle_colour: trim(f[21]) || null,
      customer_firstname: initial || null,
      customer_lastname: lastName || null,
      customer_email: null,
      customer_phone: trim(f[22]) || null,
      outbound_flight_number: null,
      return_flight_number: null,
      total_price: price,
      money_received: price,
      money_charged: price,
      currency: "GBP",
      product_code: trim(f[10]) || null,
      notes: [
        "EXTZ10 import",
        f[7] ? `Passengers: ${trim(f[7])}` : null,
        f[18] ? `Days parked: ${trim(f[18])}` : null,
        f[11] ? `Product type code: ${trim(f[11])}` : null,
      ].filter(Boolean).join("; "),
      raw: {
        fields: f,
        numbered_fields: rawFields,
        external_status: action.external_status,
        mapped_status: action.status,
        action_code: trim(f[1]),
        source_system_code: trim(f[0]),
        customer_title: title || null,
        customer_firstname: initial || null,
        customer_lastname: lastName || null,
        customer_name: customerName,
        passengers: trim(f[7]) || null,
        hotel_overnight_date: trim(f[4]) || null,
        arrival_time: trim(f[8]) || null,
        return_date: trim(f[9]) || null,
        return_time: trim(f[15]) || null,
        product_code: trim(f[10]) || null,
        product_type_code: trim(f[11]) || null,
        days_parked: trim(f[18]) || null,
        vehicle_registration: vehicleReg,
      },
    });
    stats.rows_accepted++;
  }

  stats.skipped_unknown_format = Math.max(0, stats.total_lines - stats.ext_rows_found);
  return { bookings, stats };
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
  if (looksLikeExtz10Tab("", text)) {
    return parseHolidayExtrasExtz10Text(text);
  }

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
      const startUtc = parseNaiveLocalIsoToUtc(startAt);
      endAt = startUtc
        ? new Date(new Date(startUtc).getTime() + 60 * 60 * 1000).toISOString()
        : null;
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
