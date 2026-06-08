import { describe, it, expect } from "vitest";
import {
  dedupeStagingRowsByKey,
  pickStagingRowWinner,
} from "@/lib/ingest/dedupeStagingRows";

const TENANT = "tenant-aaaa-bbbb-cccc-dddddddddddd";

function stagingRow(
  ref: string,
  status: string,
  externalStatus?: string | null
) {
  return {
    dedupe_key: `${TENANT}|ref|${ref}`,
    reference: ref,
    status,
    external_status: externalStatus ?? null,
    raw_json: { external_status: externalStatus ?? null },
  };
}

describe("dedupeStagingRowsByKey", () => {
  it("keeps the last row when duplicates are both reserved", () => {
    const rows = [
      stagingRow("CAVU001", "reserved"),
      stagingRow("CAVU001", "reserved"),
      stagingRow("CAVU002", "reserved"),
    ];
    rows[0].customer_name = "First";
    rows[1].customer_name = "Last";

    const result = dedupeStagingRowsByKey(rows);

    expect(result.rows).toHaveLength(2);
    expect(result.duplicateDedupeKeys).toBe(1);
    expect(result.duplicateRowsCollapsed).toBe(1);
    expect(result.rows[0].customer_name).toBe("Last");
  });

  it("cancellation wins over a later reserved duplicate", () => {
    const rows = [
      stagingRow("CAVU001", "cancelled", "CANX"),
      stagingRow("CAVU001", "reserved", "FIRM"),
    ];

    const result = dedupeStagingRowsByKey(rows);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("cancelled");
    expect(result.duplicateDedupeKeys).toBe(1);
  });

  it("cancellation wins over an earlier reserved duplicate", () => {
    const rows = [
      stagingRow("CAVU001", "reserved", "FIRM"),
      stagingRow("CAVU001", "cancelled", "CANX"),
    ];

    const result = dedupeStagingRowsByKey(rows);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe("cancelled");
  });

  it("preserves file order by last occurrence position", () => {
    const rows = [
      stagingRow("AAA", "reserved"),
      stagingRow("BBB", "reserved"),
      stagingRow("AAA", "reserved"),
    ];

    const result = dedupeStagingRowsByKey(rows);

    expect(result.rows.map((r) => r.reference)).toEqual(["BBB", "AAA"]);
  });
});

describe("pickStagingRowWinner", () => {
  it("prefers cancelled over reserved", () => {
    const reserved = stagingRow("X", "reserved");
    const cancelled = stagingRow("X", "cancelled", "CANX");
    expect(pickStagingRowWinner(reserved, cancelled).status).toBe("cancelled");
    expect(pickStagingRowWinner(cancelled, reserved).status).toBe("cancelled");
  });
});

describe("CAVU hourly same-batch duplicate regression", () => {
  it("collapses duplicate booking_reference rows like 27_HOURLY CSV batches", () => {
    const ref = "HE123456";
    const dedupeKey = `${TENANT}|ref|${ref}`;
    const rows = [
      {
        dedupe_key: dedupeKey,
        reference: ref,
        status: "reserved",
        external_status: null,
        source_filename: "27_HOURLY_20260518_183043.csv",
        raw_json: {
          channel: "CAVU",
          mapping: "cavuV1",
          raw_fields: { booking_reference: ref, entry_datetime: "2026-05-18T10:00:00Z" },
        },
        customer_name: "Earlier row",
      },
      {
        dedupe_key: dedupeKey,
        reference: ref,
        status: "reserved",
        external_status: null,
        source_filename: "27_HOURLY_20260518_183043.csv",
        raw_json: {
          channel: "CAVU",
          mapping: "cavuV1",
          raw_fields: { booking_reference: ref, entry_datetime: "2026-05-18T11:00:00Z" },
        },
        customer_name: "Later row",
      },
    ];

    const result = dedupeStagingRowsByKey(rows);

    expect(result.rows).toHaveLength(1);
    expect(result.duplicateDedupeKeys).toBe(1);
    expect(result.duplicateRowsCollapsed).toBe(1);
    expect(result.rows[0].customer_name).toBe("Later row");
  });
});
