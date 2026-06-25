import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildBookingPayloadFromStaging,
  resolveParsedStatus,
  upsertBookingFromStagingRow,
  type StagingRow,
} from "@/lib/ingest/bookingFromStaging";

const TENANT = "tenant-1111-2222-3333-444455556666";

function mockSupabaseForPromotion(opts: {
  existingBooking?: { id: string; status: string } | null;
  updateError?: string | null;
  insertError?: string | null;
}) {
  const updatePayloads: Record<string, unknown>[] = [];
  const existingRows = opts.existingBooking
    ? [{ ...opts.existingBooking, source: "holiday_extras" }]
    : [];

  function selectExistingChain(filters: Record<string, string> = {}): any {
    const resolve = () => {
      if (filters.source) {
        return { data: existingRows.filter((r) => r.source === filters.source), error: null };
      }
      return { data: existingRows, error: null };
    };
    const chain: any = {
      eq: vi.fn((col: string, val: string) => selectExistingChain({ ...filters, [col]: val })),
      then: vi.fn((onFulfilled: any, onRejected: any) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected)
      ),
    };
    return chain;
  }

  function updateChain() {
    return {
      eq: vi.fn(() => updateChain()),
      select: vi.fn(async () => ({
        data: opts.existingBooking ? [{ id: opts.existingBooking.id }] : [],
        error: opts.updateError ? { message: opts.updateError } : null,
      })),
    };
  }

  const bookingsChain = {
    select: vi.fn(() => selectExistingChain()),
    update: vi.fn((payload: Record<string, unknown>) => {
      updatePayloads.push(payload);
      return updateChain();
    }),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { id: "new-booking-id" },
          error: opts.insertError ? { message: opts.insertError } : null,
        })),
      })),
    })),
    upsert: vi.fn(),
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") return bookingsChain;
      if (table === "tenants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { timezone: "Europe/London" },
                error: null,
              })),
            })),
          })),
        };
      }
      return {};
    }),
    rpc: vi.fn(async () => ({
      data: [
        {
          start_utc: "2026-05-25T13:30:00.000Z",
          end_utc: "2026-06-01T09:00:00.000Z",
        },
      ],
      error: null,
    })),
  };

  return { supabase: supabase as never, updatePayloads };
}

describe("staging → bookings promotion", () => {
  const stagingRow: StagingRow = {
    tenant_id: TENANT,
    reference: "KJDWZP",
    external_reference: "KJDWZP",
    external_status: "CANX",
    status: "cancelled",
    start_at: "2026-05-25T13:30:00.000Z",
    end_at: "2026-06-01T09:00:00.000Z",
    vehicle_reg: null,
    vehicle_make: null,
    vehicle_model: null,
    vehicle_colour: null,
    customer_name: "TEMPBOOKING",
    phone: null,
    flight_number: null,
    return_flight_no: null,
    price: 0,
    money_received: 0,
    source: "holidayextras",
    source_filename: "ext1250526.txt",
    raw_json: { channel: "HOLIDAY_EXTRAS", external_status: "CANX" },
  };

  it("maps staging CANX to cancelled status in payload", () => {
    expect(resolveParsedStatus(stagingRow)).toBe("CANX");
    const payload = buildBookingPayloadFromStaging(stagingRow, {
      start_at: "2026-05-25T13:30:00.000Z",
      end_at: "2026-06-01T09:00:00.000Z",
    });
    expect(payload.status).toBe("cancelled");
    expect(payload.external_status).toBe("cancelled");
    expect(payload.external_source).toBe("holiday_extras");
    expect(payload.source).toBe("holiday_extras");
    expect(payload.customer_email).toContain("@");
    expect(payload.plate).toBeNull();
  });

  it("updates existing reserved booking to cancelled when staging says CANX", async () => {
    const { supabase, updatePayloads } = mockSupabaseForPromotion({
      existingBooking: { id: "existing-booking-uuid", status: "reserved" },
    });

    const result = await upsertBookingFromStagingRow(supabase, stagingRow, {
      timezone: "Europe/London",
    });

    expect(result.log.action).toBe("updated");
    expect(result.log.mapped_status).toBe("cancelled");
    expect(updatePayloads.length).toBe(1);
    expect(updatePayloads[0].status).toBe("cancelled");
    expect(updatePayloads[0].external_status).toBe("cancelled");
    expect(updatePayloads[0].external_source).toBe("holiday_extras");
    expect(updatePayloads[0].source).toBe("holiday_extras");
    expect(updatePayloads[0].status).toBe("cancelled");
  });

  it("does not skip promotion when plate is blank", async () => {
    const { supabase, updatePayloads } = mockSupabaseForPromotion({
      existingBooking: { id: "existing-2", status: "reserved" },
    });

    const result = await upsertBookingFromStagingRow(supabase, {
      ...stagingRow,
      reference: "JFCNHP",
      external_reference: "JFCNHP",
      vehicle_reg: "",
    });

    expect(result.log.action).toBe("updated");
    expect(updatePayloads[0].plate).toBeNull();
    expect(updatePayloads[0].status).toBe("cancelled");
  });

  it("inserts when no existing booking for reference", async () => {
    const { supabase } = mockSupabaseForPromotion({ existingBooking: null });

    const result = await upsertBookingFromStagingRow(supabase, stagingRow);

    expect(result.log.action).toBe("inserted");
    expect(result.log.mapped_status).toBe("cancelled");
  });
});
