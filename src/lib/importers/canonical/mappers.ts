import Papa from "papaparse";
import type { CanonicalBooking } from "./types";
import type { HolidayExtrasParseStats } from "@/lib/importers/holidayExtras/parseHolidayExtras";
import {
  isHolidayExtrasFile,
  looksLikeExt1Tsv,
  parseHolidayExtrasText,
} from "@/lib/importers/holidayExtras/parseHolidayExtras";
import { flyparksTextToStaging, looksLikeFlyparksDirectEmail } from "@/lib/ingest/flyparksTextToStaging";

/**
 * Convert UK date/time format to ISO string
 * Supports: "26/01/2026" or "12/02/26" + "07:30" or "19:30"
 */
export function toIsoFromDMY_HM(dmy: string | null, hm: string | null): string | null {
  if (!dmy) return null;
  
  const parts = dmy.split("/").map((x) => x.trim());
  if (parts.length !== 3) return null;

  let [dd, mm, yy] = parts;
  if (yy.length === 2) yy = "20" + yy;

  const time = (hm || "00:00").trim();
  const iso = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${time.padStart(5, "0")}:00.000Z`;
  return iso;
}

export function parseMoney(str: string | null): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[^\d.]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function splitName(name: string | null): { first: string | null; last: string | null } {
  if (!name) return { first: null, last: null };
  const bits = name.trim().split(/\s+/).filter(Boolean);
  if (bits.length === 0) return { first: null, last: null };
  if (bits.length === 1) return { first: null, last: bits[0] };
  return { first: bits[0], last: bits.slice(1).join(" ") };
}

/**
 * Map CAVU hourly CSV format
 */
export function mapCavuHourlyCsv(csvText: string): CanonicalBooking[] {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = (parsed.data as any[]).filter(Boolean);

  return rows.map((r) => {
    const nm = splitName(r.customer_name ?? null);
    return {
      channel: "CAVU",
      booking_reference: r.booking_reference || null,
      third_party_reference: r.third_party_reference || null,
      start_at: r.entry_datetime ? new Date(r.entry_datetime).toISOString() : null,
      end_at: r.exit_datetime ? new Date(r.exit_datetime).toISOString() : null,
      vehicle_registration: r.license_plate || null,
      vehicle_make: r.vehicle_make || null,
      vehicle_model: r.vehicle_model || null,
      vehicle_colour: r.vehicle_colour || null,
      customer_firstname: nm.first,
      customer_lastname: nm.last,
      customer_email: null,
      customer_phone: r.contact_number || null,
      outbound_flight_number: r.flight_number || null,
      return_flight_number: r.return_flight_number || null,
      total_price: r.product_native_price ? Number(r.product_native_price) : null,
      currency: r.transaction_currency || r.product_native_currency || null,
      raw: r,
    };
  });
}

/**
 * Map APH CSV format (quoted, positional CSV)
 */
export function mapAphCsvLike(csvText: string): CanonicalBooking[] {
  // APH is a "CSV" where each row is quoted + padded
  const parsed = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
  });

  const rows = parsed.data as unknown as string[][];
  return rows.map((fields) => {
    const f = fields.map((x) => (x ?? "").trim());
    // Based on APH sample: field[1] = external_status (Cancelled/Amended/*CANX* etc), field[2] = ref, field[4] = start date, etc.
    const externalStatusRaw = (f[1] ?? "").trim().replace(/\*/g, "").trim().toUpperCase() || undefined;
    const isCancellation =
      externalStatusRaw != null &&
      (/cancel/i.test(externalStatusRaw) || externalStatusRaw === "CANX");
    const bookingRef = f[2] || null;
    const startAt = f[4] && f[11] ? toIsoFromDMY_HM(f[4], f[11]) : null;
    const endAt = f[15] && f[16] ? toIsoFromDMY_HM(f[15], f[16]) : null;

    return {
      channel: "APH",
      booking_reference: bookingRef,
      third_party_reference: null,
      start_at: startAt,
      end_at: endAt,
      vehicle_registration: f[7] || null,
      vehicle_make: f[8] || null,
      vehicle_model: null,
      vehicle_colour: f[9] || null,
      customer_firstname: f[6] || null, // May be initial
      customer_lastname: f[21] || null,
      customer_email: null,
      customer_phone: f[31] || null,
      outbound_flight_number: null,
      return_flight_number: f[17] || null,
      total_price: f[13] ? parseMoney(f[13]) : null,
      currency: "GBP",
      raw: {
        fields: f,
        external_status: externalStatusRaw,
      },
    };
  });
}

/**
 * Map Flyparks email text format
 */
export function mapFlyparksEmailText(emailText: string): CanonicalBooking[] {
  const staging = flyparksTextToStaging(emailText);
  const name = splitName(staging.customer_name);

  return [
    {
      channel: "FLYPARKS_EMAIL",
      booking_reference: staging.reference,
      third_party_reference: null,
      start_at: staging.start_at,
      end_at: staging.end_at,
      vehicle_registration: staging.vehicle_reg,
      vehicle_make: staging.vehicle_make,
      vehicle_model: staging.vehicle_model,
      vehicle_colour: staging.vehicle_colour,
      customer_firstname: name.first,
      customer_lastname: name.last,
      customer_email: staging.customer_email,
      customer_phone: staging.customer_phone,
      outbound_flight_number: null,
      return_flight_number: staging.flight_number,
      total_price: staging.total_price,
      currency: staging.currency,
      raw: staging.raw_json,
    },
  ];
}

export type DetectResult =
  | {
      bookings: CanonicalBooking[];
      format: "HOLIDAY_EXTRAS" | null;
      holidayExtrasStats?: HolidayExtrasParseStats;
    }
  | null;

/**
 * Auto-detect format from filename and content.
 * Returns { bookings, format } so that 0 rows with format HOLIDAY_EXTRAS can be treated as "empty" (EXT1 TSV not matched).
 */
export function detectAndMapFromAttachment(filename: string, text: string): DetectResult {
  const name = filename.toLowerCase();

  // Holiday Extras EXT1 TSV - detect by content first (not extension), then parse
  try {
    if (looksLikeExt1Tsv(text) || isHolidayExtrasFile(filename, text)) {
      const { bookings, stats } = parseHolidayExtrasText(text);
      return { bookings, format: "HOLIDAY_EXTRAS", holidayExtrasStats: stats };
    }
  } catch (err) {
    console.error("[detectAndMap] Holiday Extras check failed:", err);
  }

  // Flyparks email body text - check before CAVU/APH which might match CSV patterns
  if (name === "email-body.txt" || name.includes("email-body") || looksLikeFlyparksDirectEmail(filename, text)) {
    try {
      const flyparks = mapFlyparksEmailText(text);
      if (flyparks && flyparks.length > 0 && flyparks[0].booking_reference) {
        return { bookings: flyparks, format: null };
      }
    } catch (err) {
      console.error("[detectAndMap] Flyparks parse failed:", err);
    }
  }

  // CAVU hourly - check filename pattern OR content structure
  // Filename pattern: *_HOURLY_*.csv or contains "hourly" (e.g., "27_HOURLY_20260118_200042.csv")
  // Content check: has CSV headers like booking_reference, entry_datetime, OR has typical CAVU structure
  const isCavuFilename = name.includes("hourly") || 
                        /^\d+_hourly_\d+_\d+\.csv$/i.test(filename) ||
                        /_\d+_hourly_\d+\.csv/i.test(filename);
  const isCavuContent = text.includes("booking_reference") && 
                       (text.includes("entry_datetime") || text.includes("exit_datetime") || 
                        text.includes("license_plate") || text.includes("product_native_price"));
  
  if (isCavuFilename || isCavuContent) {
    try {
      return { bookings: mapCavuHourlyCsv(text), format: null };
    } catch (err) {
      console.error("[detectAndMap] CAVU parse failed:", err);
      // Fall through to try other formats
    }
  }

  // APH csv-like - check filename OR content signature
  if (name.includes("aph") || text.startsWith('"0') || text.includes('"NEW')) {
    return { bookings: mapAphCsvLike(text), format: null };
  }

  return null;
}
