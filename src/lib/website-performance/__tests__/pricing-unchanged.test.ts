import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

/**
 * Guardrail: website performance work must not alter the pricing engine
 * or checkout amount calculation path.
 */
describe("price calculations unchanged by funnel work", () => {
  it("does not modify availability engine pricing logic file in this change set intent", () => {
    const enginePath = path.resolve(__dirname, "../../availability/engine.ts");
    const src = readFileSync(enginePath, "utf8");
    expect(src).toContain("calculateAvailability");
    // Funnel code must not be imported into the pricing engine
    expect(src).not.toMatch(/website-performance|recordConversionEvent|funnel/);
  });

  it("public-checkout still derives amount from calculateAvailability", () => {
    const checkoutPath = path.resolve(
      __dirname,
      "../../../app/api/payments/public-checkout/route.ts"
    );
    const src = readFileSync(checkoutPath, "utf8");
    expect(src).toContain("calculateAvailability");
    expect(src).toContain("availability.pricing.total_price");
    expect(src).toMatch(/amount_cents\s*=\s*Math\.round\(availability\.pricing\.total_price\s*\*\s*100\)/);
  });
});
