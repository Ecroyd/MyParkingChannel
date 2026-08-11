import { describe, expect, it } from "vitest";
import { payloadContainsPiiKeys, sanitizeAnalyticsMeta } from "../sanitize";

describe("sanitizeAnalyticsMeta", () => {
  it("strips customer PII keys", () => {
    const cleaned = sanitizeAnalyticsMeta({
      email: "a@b.com",
      customer_email: "a@b.com",
      customerName: "Jane Doe",
      phone: "+441234",
      plate: "AB12 CDE",
      vehicleReg: "AB12CDE",
      step: "details",
      amount_cents: 2500,
    });
    expect(cleaned).toEqual({ step: "details", amount_cents: 2500 });
    expect(cleaned).not.toHaveProperty("email");
    expect(cleaned).not.toHaveProperty("plate");
  });

  it("redacts email-shaped strings in values", () => {
    const cleaned = sanitizeAnalyticsMeta({
      note: "contact me at test@example.com please",
    });
    expect(String(cleaned.note)).not.toContain("test@example.com");
    expect(String(cleaned.note)).toContain("[redacted]");
  });

  it("detects PII keys", () => {
    expect(payloadContainsPiiKeys({ customerEmail: "x" })).toBe(true);
    expect(payloadContainsPiiKeys({ step: "search" })).toBe(false);
  });
});
