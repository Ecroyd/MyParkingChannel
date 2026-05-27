import type { CanonicalBooking } from "../canonical/types";
import {
  mapSupplierStatusToBookingStatus,
  normalizeSupplierStatus,
} from "@/lib/ingest/importStatusMapping";

const trim = (v: unknown) => String(v ?? "").trim().replace(/^"|"$/g, "");

/** Allow EXT1, EXT2, etc. */
const EXT_VARIANT = /^EXT\d+$/i;

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
  const dd = m[1];
  const mm = m[2];
  const yy = `20${m[3]}`;
  return { dd, mm, yyyy: yy };
}

function toIsoFromDMY6_HM(dmy6: string, hm: string) {
  const d = parseDMY6(dmy6);
  const t = trim(hm) || "00:00";
  if (!d) return null;
  return `${d.yyyy}-${d.mm}-${d.dd}T${t.padStart(5, "0")}:00.000Z`;
}

function parseMoney(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Column offset: 0 = "N" then EXT1 in col1; -1 = EXT1 in col0 then ref in col1 */
function resolveExtOffset(cols: string[]): number | null {
  const c0 = trim(cols[0]);
  const c1 = trim(cols[1]);
  if (EXT_VARIANT.test(c1)) return 0;
  if (EXT_VARIANT.test(c0) && /^[A-Z0-9]{4,12}$/i.test(c1)) return -1;
  return null;
}

function fieldAt(cols: string[], index: number, offset: number): string {
  return trim(cols[index + offset]);
}

function hasExtMarker(text: string): boolean {
  return (
    text.includes("\tEXT1\t") ||
    /\tEXT\d+\t/i.test(text) ||
    /^EXT\d+\t/im.test(text)
  );
}

/**
 * Detect EXT TSV by content (not extension).
 */
export function looksLikeExt1Tsv(text: string): boolean {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return false;

  const sample = lines.slice(0, Math.min(lines.length, 20));
  const tabby = sample.filter((l) => l.includes("\t")).length;
  if (tabby < Math.ceil(sample.length * 0.8)) return false;

  const extRows = sample
    .map((l) => l.split("\t"))
    .filter((cols) => cols.length >= 14 && resolveExtOffset(cols) !== null).length;

  return extRows >= Math.ceil(sample.length * 0.4);
}

export function isHolidayExtrasFile(filename: string, text: string): boolean {
  if (looksLikeExt1Tsv(text)) return true;
  const name = filename.toLowerCase();
  if (name.startsWith("ext") && name.endsWith(".txt")) return true;
  return (
    hasExtMarker(text) &&
    (text.includes("*FIRM*") ||
      text.includes("*AMND*") ||
      text.includes("*CANX*") ||
      text.includes("FIRM") ||
      text.includes("CANX"))
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
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const stats = emptyStats(lines.length);
  const bookings: CanonicalBooking[] = [];

  for (const line of lines) {
    const f = line.split("\t");
    const offset = resolveExtOffset(f);

    if (offset === null) {
      stats.skipped_unknown_format++;
      continue;
    }

    stats.ext_rows_found++;

    const bookingRef = fieldAt(f, 2, offset) || null;
    const statusToken = fieldAt(f, 10, offset) || null;
    const rawStatus = statusToken
      ? statusToken.replace(/\*/g, "").trim().toUpperCase()
      : null;
    const supplierToken = normalizeSupplierStatus(rawStatus ?? statusToken);

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

    let startAt =
      arrivalDate && arrivalTime ? toIsoFromDMY6_HM(arrivalDate, arrivalTime) : null;
    let endAt =
      returnDate && returnTime ? toIsoFromDMY6_HM(returnDate, returnTime) : null;

    if (!startAt) {
      stats.skipped_invalid_date++;
      continue;
    }

    // End date optional — default to start + 1h when missing (CANX rows often omit return)
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
      booking_reference: bookingRef.toUpperCase(),
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
        external_status: supplierToken ?? rawStatus ?? statusToken,
        mapped_status: mappedStatus,
      },
    });
    stats.rows_accepted++;
  }

  return { bookings, stats };
}

/** @deprecated Use parseHolidayExtrasText — returns bookings only for callers not yet on stats API */
export function parseHolidayExtrasTextLegacy(text: string): CanonicalBooking[] {
  return parseHolidayExtrasText(text).bookings;
}
