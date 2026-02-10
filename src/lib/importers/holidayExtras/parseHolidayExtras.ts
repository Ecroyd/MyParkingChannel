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

/** Safe money parser: strips non-numeric chars, returns null for empty/invalid. */
function parseMoney(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Detect EXT1 TSV by content (not extension). SaaS-safe: no hardcoded filename patterns.
 * Treat as EXT1 TSV when: lots of tabs, lines split into ~16+ columns, EXT1 in 2nd column on most rows.
 */
export function looksLikeExt1Tsv(text: string): boolean {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return false;

  const sample = lines.slice(0, Math.min(lines.length, 10));
  const tabby = sample.filter((l) => l.includes("\t")).length;
  if (tabby < Math.ceil(sample.length * 0.8)) return false;

  const ok = sample
    .map((l) => l.split("\t"))
    .filter((cols) => cols.length >= 16)
    .filter((cols) => (cols[1] ?? "").trim() === "EXT1").length;

  return ok >= Math.ceil(sample.length * 0.5);
}

export function isHolidayExtrasFile(filename: string, text: string): boolean {
  if (looksLikeExt1Tsv(text)) return true;
  const name = filename.toLowerCase();
  if (name.startsWith("ext") && name.endsWith(".txt")) return true;
  // content sniff: EXT1 + tabs + *FIRM* tokens
  return text.includes("\tEXT1\t") && (text.includes("*FIRM*") || text.includes("*AMND*") || text.includes("*CANX*"));
}

/** Allow EXT1, EXT2, etc. */
const EXT_VARIANT = /^EXT\d+$/i;

export function parseHolidayExtrasText(text: string): CanonicalBooking[] {
  const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);

  // TSV: split on tabs, keep empty fields
  const rows = lines.map(line => line.split("\t"));

  return rows.map((f) => {
    // Only process lines with EXT1 / EXT2 / etc. in column 1
    const col1 = trim(f[1]);
    if (!EXT_VARIANT.test(col1)) return null;

    // Field indexes based on observed sample rows (ext1180126.txt / ext1090226.txt)
    // 0: N
    // 1: EXT1 (or EXT2, etc.)
    // 2: booking ref (KHFVGQ)
    // 3: surname
    // 4: title (MR/MRS/MS/MISS)
    // 5: first initial
    // 6: days
    // 7: arrival time (14:30)
    // 8: arrival date "190126"
    // 9: ??? (003)
    // 10: status (*FIRM*/*AMND*/*CANX*)
    // 11: money_received (left amount, e.g. 64.40)
    // 12: money_charged (right amount, e.g. 79.12)
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

    // Left column (11) = money_received; right column (12) = money_charged
    const money_received = parseMoney(f[11]);
    const money_charged = parseMoney(f[12]);
    const total_price = money_charged ?? money_received;

    // Field 10: *FIRM* | *AMND* | *CANX* — normalize to FIRM/AMND/CANX for external_status
    const statusToken = trim(f[10]) || null;
    const rawStatus = statusToken
      ? statusToken.replace(/\*/g, "").trim().toUpperCase()
      : null;

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
      total_price,
      money_received,
      money_charged,
      currency: "GBP",
      raw: { fields: f, external_status: rawStatus ?? statusToken },
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null); // Filter out nulls (rows without vehicle_reg)
}
