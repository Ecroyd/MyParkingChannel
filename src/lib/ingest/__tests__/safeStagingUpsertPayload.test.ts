import { safeStagingUpsertPayload } from "@/lib/ingest/safeStagingUpsertPayload";

describe("safeStagingUpsertPayload", () => {
  it("strips customer_email and stores it in raw_json.extracted", () => {
    const result = safeStagingUpsertPayload({
      tenant_id: "t1",
      reference: "PF41125",
      dedupe_key: "t1|flyparks_text|PF41125",
      customer_name: "Creanor",
      customer_email: "siobhan.creanor@hotmail.co.uk",
      raw_json: { kind: "flyparks_text_email", extracted: { reference: "PF41125" } },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).not.toHaveProperty("customer_email");
      const raw = result.data.raw_json as { extracted?: { email?: string } };
      expect(raw.extracted?.email).toBe("siobhan.creanor@hotmail.co.uk");
    }
  });
});
