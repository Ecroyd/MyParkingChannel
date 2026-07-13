import { describe, expect, it } from "vitest";
import { splitCustomerDetailsBlock } from "@/lib/ingest/customerContactDetails";
import { resolveCustomerName } from "@/lib/bookings/normalizeCustomerName";

/**
 * Pure-unit coverage for the repair fallback path (no DB).
 * Full preview/apply is exercised via the CLI against live data.
 */
describe("repairDirectBookingCustomerDetails fallback", () => {
  it("extracts email and phone from a contaminated customer_name", () => {
    const split = splitCustomerDetailsBlock(
      "Davies judithdavies89@aol.co.uk 07747600434"
    );
    const resolved = resolveCustomerName({
      customerName: split.name,
      customerEmail: split.email,
    });

    expect(resolved.name).toBe("Davies");
    expect(split.email).toBe("judithdavies89@aol.co.uk");
    expect(split.phone).toBe("07747600434");
    expect(resolved.name).not.toContain("@");
    expect(resolved.name).not.toMatch(/0\d{9}/);
  });
});
