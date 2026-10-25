import { describe, it, expect } from "vitest";
import {
  mapCavuHourlyCsv,
  mapLooking4OrdersCsv,
  parseMoney,
  supplierDateTimeToNaiveLocal,
} from "../mappers";
import { resolveBookingTimesToUtc, sanitizeSupplierDateTimeInput } from "@/lib/datetime/parse";
import { mapSupplierStatusToBookingStatus } from "@/lib/ingest/importStatusMapping";

/** The exact conversion promotion uses (bookingFromStaging.normaliseTimes, client path). */
function promoteTimes(start: string, end: string) {
  return resolveBookingTimesToUtc(
    sanitizeSupplierDateTimeInput(start),
    sanitizeSupplierDateTimeInput(end),
    "Europe/London"
  );
}

const L4_HEADER =
  "Reference,Order Price,Drop Off Date/Time,Return Date/Time,Car Reg,Status,Customer Full Name,Product Native Price";

describe("Looking4 mapper → promotion UTC instants", () => {
  it("DD/MM/YYYY fallback in August (BST) stores 12:00Z for 13:00 local", () => {
    const csv = `${L4_HEADER}\nL4-1,"£1,108.10",21/08/2026 13:00,26/08/2026 22:00,WL14BGK,Confirmed,Peter Bastin,"£1,108.10"\n`;
    const [b] = mapLooking4OrdersCsv(csv);
    expect(b.start_at).toBe("2026-08-21T13:00:00");
    expect(b.end_at).toBe("2026-08-26T22:00:00");
    expect(promoteTimes(b.start_at!, b.end_at!)).toEqual({
      start_at: "2026-08-21T12:00:00.000Z",
      end_at: "2026-08-26T21:00:00.000Z",
    });
  });

  it("November (GMT) stores 13:00Z for 13:00 local", () => {
    const csv = `${L4_HEADER}\nL4-2,50.00,21/11/2026 13:00,2026/11/26 22:00:00,WL14BGK,Confirmed,Peter Bastin,50.00\n`;
    const [b] = mapLooking4OrdersCsv(csv);
    expect(promoteTimes(b.start_at!, b.end_at!)).toEqual({
      start_at: "2026-11-21T13:00:00.000Z",
      end_at: "2026-11-26T22:00:00.000Z",
    });
  });

  it("parses £ and thousands commas instead of £0", () => {
    const csv = `${L4_HEADER}\nL4-3,"£1,108.10",2026/08/21 13:00:00,2026/08/26 22:00:00,WL14BGK,Confirmed,Peter Bastin,"£1,108.10"\n`;
    expect(mapLooking4OrdersCsv(csv)[0].total_price).toBe(1108.1);
  });

  it("missing price stays null (not 0)", () => {
    const csv = `${L4_HEADER}\nL4-4,,2026/08/21 13:00:00,2026/08/26 22:00:00,WL14BGK,Confirmed,Peter Bastin,\n`;
    expect(mapLooking4OrdersCsv(csv)[0].total_price).toBeNull();
  });

  it("maps Refunded to a cancellation and keeps the raw supplier status", () => {
    const csv = `${L4_HEADER}\nL4-5,50.00,2026/08/21 13:00:00,2026/08/26 22:00:00,WL14BGK,Refunded,Peter Bastin,50.00\n`;
    const [b] = mapLooking4OrdersCsv(csv);
    expect(mapSupplierStatusToBookingStatus(b.raw.external_status)).toBe("cancelled");
    expect(b.raw.supplier_status).toBe("Refunded");
  });
});

describe("CAVU hourly mapper → promotion UTC instants", () => {
  const header =
    "booking_reference,entry_datetime,exit_datetime,license_plate,customer_name,product_native_price";

  it("August (BST): 13:00 local → 12:00Z (no double conversion)", () => {
    const [b] = mapCavuHourlyCsv(`${header}\nCAVU1,2026-08-21 13:00:00,2026-08-28 09:30:00,AB12CDE,Jane Doe,"£1,234.50"\n`);
    expect(b.start_at).toBe("2026-08-21T13:00:00");
    expect(b.end_at).toBe("2026-08-28T09:30:00");
    expect(promoteTimes(b.start_at!, b.end_at!)).toEqual({
      start_at: "2026-08-21T12:00:00.000Z",
      end_at: "2026-08-28T08:30:00.000Z",
    });
    expect(b.total_price).toBe(1234.5);
  });

  it("November (GMT): 13:00 local → 13:00Z", () => {
    const [b] = mapCavuHourlyCsv(`${header}\nCAVU2,2026-11-21 13:00:00,2026-11-28 09:30:00,AB12CDE,Jane Doe,\n`);
    expect(promoteTimes(b.start_at!, b.end_at!)).toEqual({
      start_at: "2026-11-21T13:00:00.000Z",
      end_at: "2026-11-28T09:30:00.000Z",
    });
    expect(b.total_price).toBeNull();
  });
});

describe("supplierDateTimeToNaiveLocal", () => {
  it.each([
    ["2026/08/21 13:00:00", "2026-08-21T13:00:00"],
    ["2026-08-21 13:00", "2026-08-21T13:00:00"],
    ["2026-08-21T13:00:05", "2026-08-21T13:00:05"],
    ["2026-08-21T13:00:00Z", "2026-08-21T13:00:00"],
    ["21/08/2026 13:00", "2026-08-21T13:00:00"],
    ["21/08/26 13:00:30", "2026-08-21T13:00:30"],
    ["2026-08-21T12:00:00+00:00", "2026-08-21T13:00:00"],
    ["2026-11-21T13:00:00+00:00", "2026-11-21T13:00:00"],
    ["21/08/2026", "2026-08-21T00:00:00"],
  ])("%s → %s", (input, expected) => {
    expect(supplierDateTimeToNaiveLocal(input)).toBe(expected);
  });

  it("rejects invalid calendar dates and junk", () => {
    expect(supplierDateTimeToNaiveLocal("31/09/2026 10:00")).toBeNull();
    expect(supplierDateTimeToNaiveLocal("2026-02-30 10:00")).toBeNull();
    expect(supplierDateTimeToNaiveLocal("tomorrow")).toBeNull();
    expect(supplierDateTimeToNaiveLocal("")).toBeNull();
  });
});

describe("mapper parseMoney", () => {
  it("uses the shared parser and keeps missing as null", () => {
    expect(parseMoney("£12.50")).toBe(12.5);
    expect(parseMoney("Â£1,234.50")).toBe(1234.5);
    expect(parseMoney("0000061.04")).toBe(61.04);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney("-5.00")).toBeNull();
  });
});
