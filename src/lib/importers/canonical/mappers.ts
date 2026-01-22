import Papa from "papaparse";
import type { CanonicalBooking } from "./types";

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
    // Based on APH sample: field[2] = ref, field[4] = start date, field[11] = start time, etc.
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
      raw: { fields: f },
    };
  });
}

/**
 * Map Flyparks email text format
 */
export function mapFlyparksEmailText(emailText: string): CanonicalBooking[] {
  // Pull out the "label: value" lines
  const get = (label: string) => {
    const re = new RegExp(`${label}:\\s*([^\\n\\r]+)`, "i");
    const m = emailText.match(re);
    return m ? m[1].trim() : null;
  };

  const depDate = get("Departure date");
  const arrTime = get("Arrival time");
  const retDate = get("Return date");
  const retTime = get("Return time");

  const bookingRef = get("Reference");
  const reg = get("Vehicle registration");
  const makeModel = get("Vehicle model");
  const colour = get("Vehicle colour");
  const total = get("Total Cost");

  // Sometimes "Vehicle model" contains make+model in one string
  let vehicle_make: string | null = null;
  let vehicle_model: string | null = null;
  if (makeModel) {
    const bits = makeModel.split(/\s+/);
    vehicle_make = bits[0] ?? null;
    vehicle_model = bits.length > 1 ? bits.slice(1).join(" ") : null;
  }

  return [
    {
      channel: "FLYPARKS_EMAIL",
      booking_reference: bookingRef,
      third_party_reference: null,
      start_at: depDate && arrTime ? toIsoFromDMY_HM(depDate, arrTime) : null,
      end_at: retDate && retTime ? toIsoFromDMY_HM(retDate, retTime) : null,
      vehicle_registration: reg,
      vehicle_make,
      vehicle_model,
      vehicle_colour: colour,
      customer_firstname: null,
      customer_lastname: null,
      customer_email: null,
      customer_phone: null,
      outbound_flight_number: get("Departure flight number"),
      return_flight_number: get("Return flight number"),
      total_price: total ? parseMoney(total) : null,
      currency: "GBP",
      raw: { emailText },
    },
  ];
}

/**
 * Auto-detect format from filename and content
 */
export function detectAndMapFromAttachment(filename: string, text: string): CanonicalBooking[] | null {
  const name = filename.toLowerCase();

  // CAVU hourly
  if (name.includes("hourly") && text.includes("booking_reference,entry_datetime")) {
    return mapCavuHourlyCsv(text);
  }

  // APH csv-like
  if (name.includes("aph") || text.startsWith('"0') || text.includes('"NEW')) {
    return mapAphCsvLike(text);
  }

  return null;
}
