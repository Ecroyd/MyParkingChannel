import { safeBookingUpsertPayload } from "@/lib/ingest/safeBookingUpsertPayload";

describe("safeBookingUpsertPayload", () => {
  it("allows whitelisted fields", () => {
    const result = safeBookingUpsertPayload({
      tenant_id: "t1",
      reference: "REF1",
      status: "reserved",
      external_status: "confirmed",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tenant_id).toBe("t1");
      expect(result.data.external_status).toBe("confirmed");
    }
  });

  it("rejects unknown fields", () => {
    const result = safeBookingUpsertPayload({
      tenant_id: "t1",
      reference: "REF1",
      mystery_column: true,
    } as Record<string, unknown>);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("mystery_column");
    }
  });
});
