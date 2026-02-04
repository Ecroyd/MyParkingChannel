import { describe, it, expect } from "vitest";
import { mapAphCsvLike } from "../mappers";

describe("APH mapAphCsvLike cancellation", () => {
  // APH CSV: quoted positional, field[1] = external_status (Cancelled/Amended/etc), field[2] = ref
  const rowToCsvLine = (fields: string[]) =>
    fields.map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",");

  it("sets raw.external_status from column 1 and preserves ref from column 2", () => {
    // Minimal row: status in col 1, ref in col 2, then empty up to required indices
    const row = new Array(33).fill("");
    row[1] = "Cancelled";
    row[2] = "LMQ7P";
    row[4] = "01/02/26";
    row[11] = "07:30";
    row[15] = "08/02/26";
    row[16] = "19:30";
    row[7] = "AB12CDE";
    const csv = row.map((f) => `"${f}"`).join(",");
    const result = mapAphCsvLike(csv);
    expect(result.length).toBe(1);
    expect(result[0].booking_reference).toBe("LMQ7P");
    expect(result[0].raw).toBeDefined();
    expect(String((result[0].raw as any).external_status || "").toLowerCase()).toContain("cancel");
  });

  it("standard booking row has no cancellation in raw.external_status when status is empty", () => {
    const row = new Array(33).fill("");
    row[1] = "";
    row[2] = "REF123";
    row[4] = "01/02/26";
    row[11] = "07:30";
    row[15] = "08/02/26";
    row[16] = "19:30";
    row[7] = "XY99ZZZ";
    const csv = row.map((f) => `"${f}"`).join(",");
    const result = mapAphCsvLike(csv);
    expect(result.length).toBe(1);
    expect(result[0].booking_reference).toBe("REF123");
    const extStatus = (result[0].raw as any).external_status;
    expect(extStatus == null || String(extStatus).trim() === "").toBe(true);
  });
});
