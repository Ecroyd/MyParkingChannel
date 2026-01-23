import type { CanonicalBooking } from "../canonical/types";

const trim = (v: unknown) => String(v ?? "").trim().replace(/^"|"$/g, "");

function parseDMY6(dmy6: string) {
  // "190126" => 19/01/2026
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
  // Store as UTC ISO (good enough for now; refine to Europe/London if needed)
  return `${d.yyyy}-${d.mm}-${d.dd}T${t.padStart(5, "0")}:00.000Z`;
}

function parseMoney(x: string) {
  const v = trim(x);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isHolidayExtrasFile(filename: string, text: string): boolean {
  const name = filename.toLowerCase();
  if (name.startsWith("ext") && name.endsWith(".txt")) return true;
  // content sniff: EXT1 + tabs + *FIRM* tokens
  return text.includes("\tEXT1\t") && (text.includes("*FIRM*") || text.includes("*AMND*") || text.includes("*CANX*"));
}

export function parseHolidayExtrasText(text: string): CanonicalBooking[] {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);

  // TSV: split on tabs, keep empty fields
  const rows = lines.map(line => line.split("\t"));

  return rows.map((f) => {
    // Field indexes based on observed sample rows in ext1180126.txt
    // 0: N
    // 1: EXT1
    // 2: booking ref (KHFVGQ)
    // 3: surname
    // 4: title (MR/MRS/MS/MISS)
    // 5: first initial
    // 6: days
    // 7: arrival time (14:30)
    // 8: arrival date "190126"
    // 9: ??? (003)
    // 10: status (*FIRM*/*AMND*/*CANX*)
    // 11: net? (87.50)
    // 12: gross? (125 / 63.99 etc)
    // 13: return date (280126)
    // 14: return time (17:30)
    // 15: vehicle reg (MF18UFU) - CAN BE EMPTY!
    // 16: two-letter code (QI/CK/etc)
    // 17: vehicle colour
    // 18: vehicle make
    // 19: vehicle model
    // 20: outbound flight? (KL1101)
    // 21: phone1
    // 22: phone2
    // 23: sometimes "07/00" etc (ignore)
    // 24.. etc
    // 25: return flight? (KL1102) (often present)
    const bookingRef = trim(f[2]) || null;

    const startAt = (f[8] && f[7]) ? toIsoFromDMY6_HM(f[8], f[7]) : null;
    const endAt = (f[13] && f[14]) ? toIsoFromDMY6_HM(f[13], f[14]) : null;

    const surname = trim(f[3]) || null;
    const firstInitial = trim(f[5]) || null;

    // Use gross (index 12) if present, else net (11)
    const price = parseMoney(f[12]) ?? parseMoney(f[11]);

    const status = trim(f[10]) || null;

    // Phones sometimes include country codes and quoting
    const phone = trim(f[21]) || trim(f[22]) || null;

    const outboundFlight = trim(f[20]) || null;
    const returnFlight = trim(f[25]) || null;

    const vehicleRegRaw = trim(f[15]) || "";
    // Filter out empty strings, "-", and whitespace-only values
    const vehicleReg = vehicleRegRaw && vehicleRegRaw !== "-" && vehicleRegRaw.trim() !== "" 
      ? vehicleRegRaw.trim() 
      : null;
    const vehicleColour = trim(f[17]) || null;
    const vehicleMake = trim(f[18]) || null;
    const vehicleModel = trim(f[19]) || null;

    // Skip rows without vehicle registration (required for bookings table)
    if (!vehicleReg) {
      console.warn(`[parseHolidayExtras] Skipping row with missing vehicle_reg:`, {
        bookingRef,
        field15: f[15],
        fields: f.slice(0, 20),
      });
      return null;
    }

    return {
      channel: "HOLIDAY_EXTRAS" as const,
      booking_reference: bookingRef,
      third_party_reference: null,
      start_at: startAt,
      end_at: endAt,
      vehicle_registration: vehicleReg,
      vehicle_make: vehicleMake,
      vehicle_model: vehicleModel,
      vehicle_colour: vehicleColour,
      customer_firstname: firstInitial,     // best effort: only an initial in file
      customer_lastname: surname,
      customer_email: null,
      customer_phone: phone,
      outbound_flight_number: outboundFlight,
      return_flight_number: returnFlight,
      total_price: price,
      currency: "GBP",
      raw: { fields: f, external_status: status },
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null); // Filter out nulls (rows without vehicle_reg)
}
