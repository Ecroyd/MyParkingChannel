import Papa from "papaparse";
import { parseSupplierDateTimeToUtc, buildTenantLocalIso } from "@/lib/datetime/parse";
import type { CanonicalBooking } from "./types";
import type { HolidayExtrasParseStats } from "@/lib/importers/holidayExtras/parseHolidayExtras";
import {
  isHolidayExtrasFile,
  looksLikeExtz10Tab,
  looksLikeExt1Tsv,
  parseHolidayExtrasExtz10Text,
  parseHolidayExtrasText,
} from "@/lib/importers/holidayExtras/parseHolidayExtras";
import { flyparksTextToStaging, looksLikeFlyparksDirectEmail } from "@/lib/ingest/flyparksTextToStaging";
import { parkViaEmailBodyToStaging, looksLikeParkViaEmail } from "@/lib/ingest/parkviaEmailBodyToStaging";

/**
 * Convert UK date/time format to naive tenant-local ISO (no Z suffix).
 * Supports: "26/01/2026" or "12/02/26" + "07:30" or "19:30"
 */
export function toIsoFromDMY_HM(dmy: string | null, hm: string | null): string | null {
  if (!dmy) return null;
  return buildTenantLocalIso(dmy, hm || "00:00");
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

/** Case-insensitive CSV cell lookup (Looking4 headers vary slightly by export). */
function csvCell(row: Record<string, unknown>, ...keys: string[]): string | null {
  const entries = Object.entries(row);
  for (const key of keys) {
    const want = key.toLowerCase().replace(/\s+/g, " ").trim();
    for (const [k, v] of entries) {
      if (String(k).toLowerCase().replace(/\s+/g, " ").trim() === want) {
        const s = v == null ? "" : String(v).trim();
        return s || null;
      }
    }
  }
  return null;
}

/**
 * Looking4.com OrdersPlacedToday hourly CSV
 * Headers: Reference, Order Price, Drop Off Date/Time, Return Date/Time, Car Reg, Status, ...
 */
export function looksLikeLooking4OrdersCsv(filename: string, text: string): boolean {
  const name = filename.toLowerCase();
  if (name.includes("ordersplacedtoday")) return true;
  const head = text.slice(0, 800).toLowerCase();
  return (
    head.includes("drop off date/time") &&
    head.includes("return date/time") &&
    (head.includes("car reg") || head.includes("third party reference"))
  );
}

/** Looking4 "2026/08/21 13:00:00" → naive tenant-local ISO for staging promotion. */
function looking4DateTimeToNaiveLocal(raw: string | null): string | null {
  if (!raw) return null;
  const m = String(raw)
    .trim()
    .match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return parseSupplierDateTimeToUtc(raw); // fallback
  const y = m[1];
  const mo = m[2].padStart(2, "0");
  const d = m[3].padStart(2, "0");
  const h = m[4].padStart(2, "0");
  const mi = m[5].padStart(2, "0");
  const s = (m[6] ?? "00").padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

export function mapLooking4OrdersCsv(csvText: string): CanonicalBooking[] {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = (parsed.data as Record<string, unknown>[]).filter(Boolean);
  const bookings: CanonicalBooking[] = [];

  for (const r of rows) {
    const bookingRef = csvCell(r, "Reference");
    if (!bookingRef) continue;

    const customerName = csvCell(r, "Customer Full Name");
    const nm = splitName(customerName);
    const externalStatus = csvCell(r, "Status");
    const priceRaw =
      csvCell(r, "Product Native Price") ?? csvCell(r, "Order Price");

    bookings.push({
      channel: "LOOKING4",
      booking_reference: bookingRef,
      third_party_reference: csvCell(r, "Third Party Reference"),
      // Naive local (no Z) — bookingFromStaging converts London → UTC once
      start_at: looking4DateTimeToNaiveLocal(csvCell(r, "Drop Off Date/Time")),
      end_at: looking4DateTimeToNaiveLocal(csvCell(r, "Return Date/Time")),
      vehicle_registration: csvCell(r, "Car Reg"),
      vehicle_make: csvCell(r, "Make"),
      vehicle_model: csvCell(r, "Model"),
      vehicle_colour: csvCell(r, "Car Colour"),
      customer_firstname: nm.first,
      customer_lastname: nm.last,
      customer_email: null,
      customer_phone: csvCell(r, "Contact Number"),
      outbound_flight_number: csvCell(r, "Departure Flight Number"),
      return_flight_number: csvCell(r, "Return Flight Number"),
      total_price: priceRaw ? Number(priceRaw) : null,
      currency:
        csvCell(r, "Transaction Currency") ??
        csvCell(r, "Product Native Currency") ??
        "GBP",
      raw: {
        ...r,
        external_status: externalStatus,
      },
    });
  }

  return bookings;
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
      start_at: r.entry_datetime ? parseSupplierDateTimeToUtc(r.entry_datetime) : null,
      end_at: r.exit_datetime ? parseSupplierDateTimeToUtc(r.exit_datetime) : null,
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

export function mapParkViaEmailText(emailText: string): CanonicalBooking[] {
  const staging = parkViaEmailBodyToStaging(emailText);
  const name = splitName(staging.customer_name);

  return [
    {
      channel: "PARKVIA_EMAIL",
      booking_reference: staging.reference,
      third_party_reference: staging.reference,
      start_at: staging.start_at,
      end_at: staging.end_at,
      vehicle_registration: staging.vehicle_reg,
      vehicle_make: null,
      vehicle_model: null,
      vehicle_colour: null,
      customer_firstname: name.first,
      customer_lastname: name.last,
      customer_email: staging.customer_email,
      customer_phone: staging.customer_phone,
      outbound_flight_number: null,
      return_flight_number: null,
      total_price: staging.total_price,
      money_received: staging.money_received,
      money_charged: staging.total_price,
      currency: "GBP",
      product_code: staging.product_code,
      notes: staging.notes,
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

  if (looksLikeExtz10Tab(filename, text)) {
    const { bookings, stats } = parseHolidayExtrasExtz10Text(text);
    return { bookings, format: "HOLIDAY_EXTRAS", holidayExtrasStats: stats };
  }

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

  if (name === "email-body.txt" || name.includes("email-body") || looksLikeParkViaEmail({ subject: filename, body: text })) {
    try {
      const parkvia = mapParkViaEmailText(text);
      if (parkvia && parkvia.length > 0 && parkvia[0].booking_reference) {
        return { bookings: parkvia, format: null };
      }
    } catch (err) {
      console.error("[detectAndMap] ParkVia parse failed:", err);
    }
  }

  // Looking4.com OrdersPlacedToday - before CAVU (different headers, no "hourly" in filename)
  if (looksLikeLooking4OrdersCsv(filename, text)) {
    try {
      const bookings = mapLooking4OrdersCsv(text);
      if (bookings.length > 0 || name.includes("ordersplacedtoday")) {
        return { bookings, format: null };
      }
    } catch (err) {
      console.error("[detectAndMap] Looking4 parse failed:", err);
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
