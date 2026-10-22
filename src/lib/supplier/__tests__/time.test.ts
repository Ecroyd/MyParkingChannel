import { describe, it, expect } from "vitest";
import { normalizeSupplierTimestamp } from "@/lib/supplier/time";

describe("normalizeSupplierTimestamp", () => {
  it("treats offset-less summer time as BST", () => {
    expect(normalizeSupplierTimestamp("2026-06-25T14:00:00")).toBe("2026-06-25T13:00:00.000Z");
    expect(normalizeSupplierTimestamp("2026-06-25 14:00")).toBe("2026-06-25T13:00:00.000Z");
  });

  it("treats offset-less winter time as GMT", () => {
    expect(normalizeSupplierTimestamp("2026-12-25T14:00:00")).toBe("2026-12-25T14:00:00.000Z");
  });

  it("treats date-only as London midnight", () => {
    expect(normalizeSupplierTimestamp("2026-06-25")).toBe("2026-06-24T23:00:00.000Z");
  });

  it("leaves Z and explicit offsets unchanged", () => {
    expect(normalizeSupplierTimestamp("2026-06-25T14:00:00Z")).toBe("2026-06-25T14:00:00Z");
    expect(normalizeSupplierTimestamp("2026-06-25T14:00:00.000+01:00")).toBe(
      "2026-06-25T14:00:00.000+01:00"
    );
    expect(normalizeSupplierTimestamp("2026-06-25T14:00:00-0500")).toBe("2026-06-25T14:00:00-0500");
  });
});
