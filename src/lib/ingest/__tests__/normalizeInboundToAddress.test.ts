import { describe, expect, it } from "vitest";
import { normalizeInboundToAddress } from "@/lib/ingest/normalizeInboundToAddress";

describe("normalizeInboundToAddress", () => {
  it("lowercases and trims Cloudflare To: addresses", () => {
    expect(normalizeInboundToAddress("BOOKINGS@MYPARKINGCHANNEL.APP")).toBe(
      "bookings@myparkingchannel.app"
    );
    expect(normalizeInboundToAddress("  bookings@myparkingchannel.app ")).toBe(
      "bookings@myparkingchannel.app"
    );
  });

  it("returns null for empty values", () => {
    expect(normalizeInboundToAddress(null)).toBeNull();
    expect(normalizeInboundToAddress("")).toBeNull();
    expect(normalizeInboundToAddress("   ")).toBeNull();
  });
});
