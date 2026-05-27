import {
  mapSupplierStatusToBookingStatus,
  normalizeSupplierStatus,
  isCancelledSupplierStatus,
} from "@/lib/ingest/importStatusMapping";

describe("importStatusMapping", () => {
  it("normalizes asterisk tokens", () => {
    expect(normalizeSupplierStatus("*CANX*")).toBe("CANX");
    expect(normalizeSupplierStatus("*FIRM*")).toBe("FIRM");
    expect(normalizeSupplierStatus("*AMND*")).toBe("AMND");
  });

  it("maps supplier tokens to booking status", () => {
    expect(mapSupplierStatusToBookingStatus("*FIRM*")).toBe("reserved");
    expect(mapSupplierStatusToBookingStatus("*AMND*")).toBe("reserved");
    expect(mapSupplierStatusToBookingStatus("*CANX*")).toBe("cancelled");
    expect(mapSupplierStatusToBookingStatus("NEW")).toBe("reserved");
    expect(mapSupplierStatusToBookingStatus("CANCELLED")).toBe("cancelled");
    expect(mapSupplierStatusToBookingStatus("cancelled")).toBe("cancelled");
  });

  it("detects cancelled supplier status", () => {
    expect(isCancelledSupplierStatus("CANX")).toBe(true);
    expect(isCancelledSupplierStatus("FIRM")).toBe(false);
  });
});
