import { describe, it, expect, vi } from "vitest";
import {
  isReinstatingSupplierStatus,
  upsertBookingFromStagingRow,
  type StagingRow,
} from "@/lib/ingest/bookingFromStaging";
import { dedupeStagingRowsByKey } from "@/lib/ingest/dedupeStagingRows";
import {
  buildTenantLocalIso,
  parseNaiveLocalIsoToUtc,
  parseTenantLocalDateTimeToUtc,
} from "@/lib/datetime/parse";

const TENANT = "tenant-1111";

function mockSupabase(existing: { id: string; status: string; source: string; plate?: string }) {
  const updatePayloads: Record<string, unknown>[] = [];
  function selectChain(): any {
    const chain: any = {
      eq: vi.fn(() => chain),
      then: (ok: any, err: any) => Promise.resolve({ data: [existing], error: null }).then(ok, err),
    };
    return chain;
  }
  function updateChain(): any {
    return {
      eq: vi.fn(() => updateChain()),
      select: vi.fn(async () => ({ data: [{ id: existing.id }], error: null })),
    };
  }
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => selectChain()),
      update: vi.fn((p: Record<string, unknown>) => {
        updatePayloads.push(p);
        return updateChain();
      }),
      insert: vi.fn(),
      upsert: vi.fn(),
    })),
    rpc: vi.fn(),
  };
  return { supabase: supabase as never, updatePayloads };
}

const baseRow: StagingRow = {
  tenant_id: TENANT,
  reference: "PV12345678",
  external_reference: "PV12345678",
  external_status: "new",
  status: "reserved",
  start_at: "2026-10-26T13:30:00",
  end_at: "2026-11-02T09:00:00",
  vehicle_reg: "AB12CDE",
  customer_name: "Jane Doe",
  price: 50,
  money_received: 50,
  source: "parkvia",
  raw_json: { channel: "PARKVIA_EMAIL", external_status: "new" },
} as StagingRow;

describe("resent confirmation does not un-cancel", () => {
  it("keeps a cancelled booking cancelled when a plain NEW confirmation is reprocessed", async () => {
    const { supabase, updatePayloads } = mockSupabase({ id: "b1", status: "cancelled", source: "parkvia" });
    const result = await upsertBookingFromStagingRow(supabase, baseRow, { timezone: "Europe/London" });
    expect(result.log.action).toBe("updated");
    expect(updatePayloads[0]).not.toHaveProperty("status");
    expect(updatePayloads[0]).not.toHaveProperty("external_status");
    expect(updatePayloads[0]).not.toHaveProperty("gate_status");
    expect(updatePayloads[0]).not.toHaveProperty("ops_status");
  });

  it("an explicit amendment reinstates the booking and the gate/ops board together", async () => {
    const { supabase, updatePayloads } = mockSupabase({ id: "b1", status: "cancelled", source: "parkvia" });
    await upsertBookingFromStagingRow(
      supabase,
      { ...baseRow, external_status: "AMENDED", raw_json: { channel: "PARKVIA_EMAIL", external_status: "AMENDED" } },
      { timezone: "Europe/London" }
    );
    expect(updatePayloads[0].status).toBe("reserved");
    expect(updatePayloads[0].gate_status).toBe("reserved");
    expect(updatePayloads[0].ops_status).toBe("reserved");
  });

  it("a reserved booking still updates normally", async () => {
    const { supabase, updatePayloads } = mockSupabase({ id: "b1", status: "reserved", source: "parkvia" });
    await upsertBookingFromStagingRow(supabase, baseRow, { timezone: "Europe/London" });
    expect(updatePayloads[0].status).toBe("reserved");
    expect(updatePayloads[0].start_at).toBe("2026-10-26T13:30:00.000Z");
  });

  it("a placeholder plate does not overwrite the stored plate", async () => {
    const { supabase, updatePayloads } = mockSupabase({ id: "b1", status: "reserved", source: "parkvia" });
    await upsertBookingFromStagingRow(supabase, { ...baseRow, vehicle_reg: "TBC" }, { timezone: "Europe/London" });
    expect(updatePayloads[0]).not.toHaveProperty("plate");
  });

  it("isReinstatingSupplierStatus", () => {
    for (const s of ["AMND", "*AMND*", "AMEND", "Amended", "AMENDMENT", "reinstated"]) {
      expect(isReinstatingSupplierStatus(s)).toBe(true);
    }
    for (const s of ["NEW", "new", "FIRM", "RESERVED", null, ""]) {
      expect(isReinstatingSupplierStatus(s)).toBe(false);
    }
  });
});

describe("dedupe winner ignores 'Free cancellation' text", () => {
  it("a later confirmed row wins over an earlier one whose product mentions free cancellation", () => {
    const rows = [
      { dedupe_key: "k", status: "reserved", external_status: "NEW", raw_json: { product: "Free cancellation", n: 1 } },
      { dedupe_key: "k", status: "reserved", external_status: "AMENDED", raw_json: { product: "Standard", n: 2 } },
    ];
    expect(dedupeStagingRowsByKey(rows).rows[0].raw_json).toEqual({ product: "Standard", n: 2 });
  });
});

describe("calendar validation", () => {
  it("rejects impossible dates instead of throwing RangeError later", () => {
    expect(buildTenantLocalIso("31/09/2026", "10:00")).toBeNull();
    expect(buildTenantLocalIso("29/02/2026", "10:00")).toBeNull();
    expect(buildTenantLocalIso("29/02/2028", "10:00")).toBe("2028-02-29T10:00:00");
    expect(parseTenantLocalDateTimeToUtc("31/09/2026", "10:00")).toBeNull();
    expect(() => parseNaiveLocalIsoToUtc("2026-09-31T10:00:00")).not.toThrow();
    expect(parseNaiveLocalIsoToUtc("2026-09-31T10:00:00")).toBeNull();
    expect(parseNaiveLocalIsoToUtc("2026-09-30T10:00:00")).toBe("2026-09-30T09:00:00.000Z");
  });
});
