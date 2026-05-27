import { describe, it, expect } from "vitest";
import { parseHolidayExtrasText } from "../parseHolidayExtras";

function extRow(fields: Partial<Record<number, string>>): string {
  const cols: string[] = new Array(26).fill("");
  cols[0] = "N";
  cols[1] = "EXT1";
  cols[2] = "KJDWZP";
  cols[3] = "TEMPBOOKING";
  cols[5] = "T";
  cols[7] = "14:30";
  cols[8] = "190126";
  cols[10] = "*CANX*";
  cols[11] = "0";
  cols[12] = "0";
  cols[13] = "";
  cols[14] = "";
  cols[15] = "";
  Object.entries(fields).forEach(([i, v]) => {
    cols[Number(i)] = v ?? "";
  });
  return cols.join("\t");
}

describe("parseHolidayExtrasText", () => {
  it("accepts CANX row without vehicle registration", () => {
    const text = extRow({ 10: "*CANX*", 15: "" });
    const { bookings, stats } = parseHolidayExtrasText(text);
    expect(stats.rows_accepted).toBe(1);
    expect(bookings[0].booking_reference).toBe("KJDWZP");
    expect(bookings[0].vehicle_registration).toBeNull();
    expect(bookings[0].raw?.external_status).toBe("CANX");
  });

  it("accepts FIRM row without plate (TEMPBOOKING)", () => {
    const text = extRow({
      2: "KVCMZD",
      10: "*FIRM*",
      15: "",
      3: "TEMPBOOKING",
      11: "50.00",
      12: "60.00",
      13: "280126",
      14: "17:30",
    });
    const { bookings, stats } = parseHolidayExtrasText(text);
    expect(stats.rows_accepted).toBe(1);
    expect(bookings[0].booking_reference).toBe("KVCMZD");
    expect(bookings[0].raw?.mapped_status).toBe("reserved");
  });

  it("skips row missing reference", () => {
    const text = extRow({ 2: "", 10: "*FIRM*" });
    const { bookings, stats } = parseHolidayExtrasText(text);
    expect(bookings).toHaveLength(0);
    expect(stats.skipped_missing_reference).toBe(1);
  });

  it("parses multiple CANX and FIRM refs in one file", () => {
    const refs = [
      { ref: "KJDWZP", status: "*CANX*" },
      { ref: "KVDFSK", status: "*CANX*" },
      { ref: "KVCMZD", status: "*FIRM*", plate: "AB12CDE" },
    ];
    const text = refs
      .map(({ ref, status, plate }) =>
        extRow({
          2: ref,
          10: status,
          15: plate ?? "",
          13: "280126",
          14: "17:30",
        })
      )
      .join("\n");
    const { bookings, stats } = parseHolidayExtrasText(text);
    expect(stats.rows_accepted).toBe(3);
    expect(bookings.map((b) => b.booking_reference).sort()).toEqual([
      "KJDWZP",
      "KVCMZD",
      "KVDFSK",
    ]);
  });
});
