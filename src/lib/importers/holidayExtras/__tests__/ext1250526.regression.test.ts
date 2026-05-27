import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { parseHolidayExtrasText } from "../parseHolidayExtras";
import { mapSupplierStatusToBookingStatus } from "@/lib/ingest/importStatusMapping";
import { detectAndMapFromAttachment } from "@/lib/importers/canonical/mappers";

const FIXTURE_PATH = join(__dirname, "../__fixtures__/ext1250526.txt");

const CANX_REFS = ["KJDWZP", "KVDFSK", "JFCNHP", "KVBTQR", "KVCBVJ"];
const FIRM_REFS = [
  "KVCMZD",
  "KRVXGY",
  "KVDHWG",
  "KTGMQL",
  "KVBWRZ",
  "KVCKRS",
  "KVBXLH",
  "KJQPPV",
];

describe("ext1250526.txt regression (Holiday Extras EXT attachment)", () => {
  const fixtureText = readFileSync(FIXTURE_PATH, "utf8");

  it("detects as HOLIDAY_EXTRAS and accepts all fixture rows", () => {
    const detected = detectAndMapFromAttachment("ext1250526.txt", fixtureText);
    expect(detected?.format).toBe("HOLIDAY_EXTRAS");
    expect(detected?.bookings.length).toBe(13);
    expect(detected?.holidayExtrasStats?.rows_accepted).toBe(13);
  });

  it("parses CANX refs as cancelled without vehicle registration", () => {
    const { bookings, stats } = parseHolidayExtrasText(fixtureText);
    expect(stats.rows_accepted).toBe(13);
    expect(stats.skipped_missing_reference).toBe(0);
    expect(stats.skipped_invalid_date).toBe(0);

    for (const ref of CANX_REFS) {
      const row = bookings.find((b) => b.booking_reference === ref);
      expect(row, `missing CANX ref ${ref}`).toBeDefined();
      expect(row!.vehicle_registration).toBeNull();
      expect(mapSupplierStatusToBookingStatus(row!.raw?.external_status as string)).toBe(
        "cancelled"
      );
    }
  });

  it("parses FIRM refs as reserved including TEMPBOOKING-style names and optional plate", () => {
    const { bookings } = parseHolidayExtrasText(fixtureText);

    for (const ref of FIRM_REFS) {
      const row = bookings.find((b) => b.booking_reference === ref);
      expect(row, `missing FIRM ref ${ref}`).toBeDefined();
      expect(mapSupplierStatusToBookingStatus(row!.raw?.external_status as string)).toBe(
        "reserved"
      );
      expect(row!.start_at).toBeTruthy();
      expect(row!.end_at).toBeTruthy();
    }

    const withPlate = bookings.find((b) => b.booking_reference === "KVCMZD");
    expect(withPlate?.vehicle_registration).toBe("AB12CDE");

    const canx = bookings.find((b) => b.booking_reference === "KJDWZP");
    expect(canx?.customer_lastname).toBe("TEMPBOOKING");
    expect(canx?.money_charged).toBe(0);
  });

  it("does not skip rows for missing plate (ext1250526 CANX pattern)", () => {
    const { stats } = parseHolidayExtrasText(fixtureText);
    expect(stats.ext_rows_found).toBe(13);
    expect(stats.rows_accepted).toBe(13);
    expect(stats.skipped_unknown_format).toBe(0);
  });
});
