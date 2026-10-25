import { describe, it, expect } from "vitest";
import { isCancelledRow } from "../cancellationDetection";

describe("isCancelledRow", () => {
  it("returns true when status starts with cancel", () => {
    expect(isCancelledRow({ status: "cancelled" })).toBe(true);
    expect(isCancelledRow({ status: "Cancelled" })).toBe(true);
    expect(isCancelledRow({ status: "CANCELLATION" })).toBe(true);
  });

  it("returns true when external_status contains cancel", () => {
    expect(isCancelledRow({ external_status: "cancelled" })).toBe(true);
    expect(isCancelledRow({ external_status: "Cancel" })).toBe(true);
    expect(isCancelledRow({ external_status: "CANX" })).toBe(true);
    expect(isCancelledRow({ external_status: "*CANX*" })).toBe(true);
  });

  it("returns true for raw_json status fields and the explicit CANX token", () => {
    expect(isCancelledRow({ raw_json: { external_status: "Cancelled" } })).toBe(true);
    expect(isCancelledRow({ raw_json: { status: "CANCELLED" } })).toBe(true);
    expect(isCancelledRow({ raw_json: { fields: ["0001", "*CANX*", "REF1"] } })).toBe(true);
    expect(isCancelledRow({ raw_json: "row *CANX* REF1" })).toBe(true);
  });

  it("ignores free text mentioning cancellation outside status fields", () => {
    expect(isCancelledRow({ raw_json: { note: "Booking cancelled" } })).toBe(false);
    expect(isCancelledRow({ raw_json: "cancellation" })).toBe(false);
    expect(
      isCancelledRow({
        status: "reserved",
        external_status: "NEW",
        raw_json: { product: "Meet & Greet - Free cancellation up to 24h", external_status: "NEW" },
      })
    ).toBe(false);
  });

  it("returns false for reserved/active status", () => {
    expect(isCancelledRow({ status: "reserved" })).toBe(false);
    expect(isCancelledRow({ status: "checked_in" })).toBe(false);
    expect(isCancelledRow({ external_status: "confirmed" })).toBe(false);
  });

  it("returns false when raw_json has no cancel keyword", () => {
    expect(isCancelledRow({ raw_json: { note: "Booking confirmed" } })).toBe(false);
  });
});
