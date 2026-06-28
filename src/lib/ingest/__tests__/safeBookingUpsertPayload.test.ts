import { toBookingInsertPayload } from "@/lib/ingest/safeBookingUpsertPayload";

describe("toBookingInsertPayload", () => {
  it("allows whitelisted fields", () => {
    const result = toBookingInsertPayload({
      tenant_id: "t1",
      reference: "REF1",
      customer_name: "Test",
      start_at: "2026-01-01T10:00:00.000Z",
      end_at: "2026-01-02T10:00:00.000Z",
      status: "reserved",
      external_status: "confirmed",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tenant_id).toBe("t1");
      expect(result.data.external_status).toBe("confirmed");
    }
  });

  it("strips supplier_status and maps to external_status", () => {
    const result = toBookingInsertPayload({
      tenant_id: "t1",
      reference: "PF41125",
      customer_name: "Creanor",
      start_at: "2026-06-28T03:00:00.000Z",
      end_at: "2026-07-02T21:00:00.000Z",
      supplier_status: "RESERVED",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).not.toHaveProperty("supplier_status");
      expect(result.data.external_status).toBe("RESERVED");
    }
  });

  it("guarantees customer_name from email local-part when name missing", () => {
    const result = toBookingInsertPayload({
      tenant_id: "t1",
      reference: "PF40926",
      customer_name: null,
      customer_email: "keristorey5@gmail.com",
      start_at: "2026-06-15T05:45:00.000Z",
      end_at: "2026-06-22T23:25:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.customer_name).toBe("Keristorey");
      expect(result.data).not.toHaveProperty("supplier_status");
    }
  });

  it("rejects unknown fields", () => {
    const result = toBookingInsertPayload({
      tenant_id: "t1",
      reference: "REF1",
      customer_name: "Test",
      start_at: "2026-01-01T10:00:00.000Z",
      end_at: "2026-01-02T10:00:00.000Z",
      mystery_column: true,
    } as Record<string, unknown>);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("mystery_column");
    }
  });
});
