import { describe, it, expect } from "vitest";
import { normalizeBookingSourceForDb } from "@/lib/bookings/normalizeBookingSource";

describe("normalizeBookingSourceForDb", () => {
  it("maps holidayextras and HOLIDAY_EXTRAS to holiday_extras", () => {
    expect(normalizeBookingSourceForDb("holidayextras")).toBe("holiday_extras");
    expect(
      normalizeBookingSourceForDb("holidayextras", { channel: "HOLIDAY_EXTRAS" })
    ).toBe("holiday_extras");
    expect(
      normalizeBookingSourceForDb(null, { externalSource: "holiday_extras" })
    ).toBe("holiday_extras");
  });

  it("maps APH variants to aph", () => {
    expect(normalizeBookingSourceForDb("APH")).toBe("aph");
    expect(normalizeBookingSourceForDb("other", { channel: "APH" })).toBe("aph");
  });

  it("passes through cavu and direct", () => {
    expect(normalizeBookingSourceForDb("cavu")).toBe("cavu");
    expect(normalizeBookingSourceForDb("direct")).toBe("direct");
  });
});
