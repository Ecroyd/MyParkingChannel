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
  // Normalize text: remove HTML tags, normalize whitespace
  const cleanText = emailText
    .replace(/<[^>]+>/g, " ") // Remove HTML tags
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  
  // Pull out the "label: value" lines - more flexible matching
  const get = (label: string) => {
    // Escape special regex characters in label
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // List of known field labels to stop at (prevents capturing too much)
    const stopLabels = [
      'Departure date', 'Arrival time', 'Return date', 'Return time',
      'Reference', 'Vehicle registration', 'Vehicle model', 'Vehicle colour',
      'Total Cost', 'Days', 'Parking Cost', 'Product', 'Product Base Cost',
      'Departure flight number', 'Return flight number'
    ];
    const stopPattern = stopLabels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    
    // Try various patterns - but stop at next field label, newline, or reasonable length
    const patterns = [
      // Standard: "Label: value" (stop at next label, newline, or 50 chars max for date/time fields)
      new RegExp(`${escapedLabel}:\\s*([^\\n\\r]{1,50}?)(?=\\s*(?:${stopPattern}):|\\n|\\r|$)`, "i"),
      // With tabs: "Label:\tvalue"
      new RegExp(`${escapedLabel}:\\s+([^\\n\\r]{1,50}?)(?=\\s*(?:${stopPattern}):|\\n|\\r|$)`, "i"),
      // Without colon: "Label value"
      new RegExp(`${escapedLabel}\\s+([^\\n\\r:]{1,50}?)(?=\\s*(?:${stopPattern}):|\\n|\\r|$)`, "i"),
      // HTML format: "Label:</strong> value"
      new RegExp(`${escapedLabel}[^>]*>\\s*([^<\\n\\r]{1,50}?)(?=<|\\s*(?:${stopPattern}):|\\n|\\r|$)`, "i"),
    ];
    
    for (const pattern of patterns) {
      const m = cleanText.match(pattern);
      if (m && m[1]) {
        let value = m[1].trim();
        
        // Stop if we hit another field label
        const nextFieldMatch = value.match(new RegExp(`^(.+?)(?:\\s+(?:${stopPattern}):)`, "i"));
        if (nextFieldMatch) {
          value = nextFieldMatch[1].trim();
        }
        
        // Remove any trailing colons or extra punctuation
        value = value.replace(/[:;,\\.]+$/, "").trim();
        
        // For date/time fields, ensure they're reasonable length (dates are ~10 chars, times are ~5)
        if (label.includes('date') && value.length > 15) {
          // Try to extract just the date part (format: DD/MM/YYYY or DD/MM/YY)
          const dateMatch = value.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
          if (dateMatch) {
            value = dateMatch[1];
          } else {
            value = value.substring(0, 15).trim();
          }
        }
        if (label.includes('time') && value.length > 8) {
          // Try to extract just the time part (format: HH:MM)
          const timeMatch = value.match(/(\d{1,2}:\d{2})/);
          if (timeMatch) {
            value = timeMatch[1];
          } else {
            value = value.substring(0, 8).trim();
          }
        }
        
        return value || null;
      }
    }
    
    // Fallback: if standard extraction failed, try line-by-line parsing for forwarded emails
    // Split by common delimiters and look for the label
    const lines = cleanText.split(/\n|\r|\\t/);
    for (const line of lines) {
      const lineLower = line.toLowerCase();
      const labelLower = label.toLowerCase();
      if (lineLower.includes(labelLower)) {
        // Try to extract value after label
        const match = line.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:?\\s*([^\\s]+)`, "i"));
        if (match && match[1]) {
          let value = match[1].trim();
          // Clean up value
          value = value.replace(/[:;,\\.]+$/, "").trim();
          // For dates/times, extract just the pattern
          if (label.includes('date')) {
            const dateMatch = value.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
            if (dateMatch) return dateMatch[1];
          }
          if (label.includes('time')) {
            const timeMatch = value.match(/(\d{1,2}:\d{2})/);
            if (timeMatch) return timeMatch[1];
          }
          return value.length <= 50 ? value : null;
        }
      }
    }
    
    return null;
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

  // Extract customer name if available (look for patterns like "Your details:" or name before email)
  let customer_firstname: string | null = null;
  let customer_lastname: string | null = null;
  const nameMatch = cleanText.match(/(?:Your details?:|Customer name:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
  if (nameMatch) {
    const nameParts = nameMatch[1].trim().split(/\s+/);
    if (nameParts.length >= 2) {
      customer_firstname = nameParts[0];
      customer_lastname = nameParts.slice(1).join(" ");
    } else if (nameParts.length === 1) {
      customer_lastname = nameParts[0];
    }
  }

  // Extract email if available
  const emailMatch = cleanText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  const customer_email = emailMatch ? emailMatch[1] : null;

  // Extract phone if available
  const phoneMatch = cleanText.match(/(?:Phone|Contact|Tel)[:\s]*([0-9\s+\-()]+)/i) || 
                     cleanText.match(/(0[0-9]{10,11})/);
  const customer_phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, "") : null;

  // Sometimes "Vehicle model" contains make+model in one string
  let vehicle_make: string | null = null;
  let vehicle_model: string | null = null;
  if (makeModel) {
    const bits = makeModel.trim().split(/\s+/);
    vehicle_make = bits[0] ?? null;
    vehicle_model = bits.length > 1 ? bits.slice(1).join(" ") : null;
  }

  // Log extracted values for debugging
  console.log("[mapFlyparksEmailText] Extracted:", {
    bookingRef,
    depDate,
    arrTime,
    retDate,
    retTime,
    reg,
    makeModel,
    colour,
    total,
    customer_firstname,
    customer_lastname,
    customer_email,
    customer_phone,
  });

  // Validate dates before converting - they should be short date strings, not long text
  const isValidDateString = (str: string | null) => {
    if (!str) return false;
    // Should be a date format like "26/01/2026" or "02/02/2026", not long text
    return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(str.trim());
  };

  const isValidTimeString = (str: string | null) => {
    if (!str) return false;
    // Should be a time format like "07:30" or "19:30", not long text
    return /^\d{1,2}:\d{2}$/.test(str.trim());
  };

  const startAt = (depDate && arrTime && isValidDateString(depDate) && isValidTimeString(arrTime))
    ? toIsoFromDMY_HM(depDate, arrTime)
    : null;
  const endAt = (retDate && retTime && isValidDateString(retDate) && isValidTimeString(retTime))
    ? toIsoFromDMY_HM(retDate, retTime)
    : null;

  // Log if dates are invalid
  if (!startAt && depDate) {
    console.warn("[mapFlyparksEmailText] Invalid start date format:", { depDate, arrTime, depDateLength: depDate?.length });
  }
  if (!endAt && retDate) {
    console.warn("[mapFlyparksEmailText] Invalid end date format:", { retDate, retTime, retDateLength: retDate?.length });
  }

  return [
    {
      channel: "FLYPARKS_EMAIL",
      booking_reference: bookingRef,
      third_party_reference: null,
      start_at: startAt,
      end_at: endAt,
      vehicle_registration: reg,
      vehicle_make,
      vehicle_model,
      vehicle_colour: colour,
      customer_firstname,
      customer_lastname,
      customer_email,
      customer_phone,
      outbound_flight_number: get("Departure flight number"),
      return_flight_number: get("Return flight number"),
      total_price: total ? parseMoney(total) : null,
      currency: "GBP",
      raw: { emailText: cleanText, original: emailText },
    },
  ];
}

/**
 * Auto-detect format from filename and content
 */
export function detectAndMapFromAttachment(filename: string, text: string): CanonicalBooking[] | null {
  const name = filename.toLowerCase();

  // Holiday Extras - check first (tab-delimited, specific format)
  try {
    const { isHolidayExtrasFile, parseHolidayExtrasText } = require("@/lib/importers/holidayExtras/parseHolidayExtras");
    if (isHolidayExtrasFile(filename, text)) {
      return parseHolidayExtrasText(text);
    }
  } catch (err) {
    console.error("[detectAndMap] Holiday Extras check failed:", err);
  }

  // Flyparks email body text - check before CAVU/APH which might match CSV patterns
  if (name === "email-body.txt" || name.includes("email-body") || 
      (text.includes("Departure date") && text.includes("Reference:"))) {
    try {
      const flyparks = mapFlyparksEmailText(text);
      if (flyparks && flyparks.length > 0 && flyparks[0].booking_reference) {
        return flyparks;
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
      return mapCavuHourlyCsv(text);
    } catch (err) {
      console.error("[detectAndMap] CAVU parse failed:", err);
      // Fall through to try other formats
    }
  }

  // APH csv-like - check filename OR content signature
  if (name.includes("aph") || text.startsWith('"0') || text.includes('"NEW')) {
    return mapAphCsvLike(text);
  }

  return null;
}
