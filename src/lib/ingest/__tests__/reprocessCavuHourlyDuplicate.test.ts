import { describe, it, expect, vi } from "vitest";
import { mapCavuHourlyCsv } from "@/lib/importers/canonical/mappers";
import { makeStagingDedupeKey } from "@/lib/ingest/bookingFromStaging";
import { dedupeStagingRowsByKey } from "@/lib/ingest/dedupeStagingRows";
import {
  finalizeIngestEmailFileParseSuccess,
  isFileParseFailedForBanner,
  prepareIngestEmailFileForRetry,
} from "@/lib/ingest/ingestEmailFileStatus";
import { buildParseReasonSummary } from "@/lib/ingest/parseOutcome";
import { getAttribution } from "@/lib/importAttribution";

const TENANT = "bab45dab-19e8-4230-b18e-ee1f663608e5";
const FILE_ID = "da3759d6-4101-41be-91f4-a0504fccebbf";
const REF = "L4PUK-1062368";

const CAVU_HOURLY_CSV = `booking_reference,entry_datetime,exit_datetime,license_plate,customer_name,product_native_price
${REF},2026-06-06T02:00:00Z,2026-06-06T10:00:00Z,WK73VXW,Test Customer,25.00
${REF},2026-06-06T03:00:00Z,2026-06-06T11:00:00Z,WK73VXW,Test Customer Updated,30.00
`;

function buildStagingFromCavuRows(rows: ReturnType<typeof mapCavuHourlyCsv>) {
  const attribution = getAttribution("cavu_email_import");
  return rows.map((raw) => {
    const ref = String(raw.booking_reference).trim().toUpperCase();
    return {
      tenant_id: TENANT,
      source: attribution.bookingSource,
      source_filename: "27_HOURLY_20260518_183043.csv",
      reference: ref,
      external_reference: ref,
      external_status: null,
      start_at: raw.start_at,
      end_at: raw.end_at,
      vehicle_reg: raw.vehicle_registration,
      status: "reserved",
      dedupe_key: makeStagingDedupeKey(TENANT, ref),
      raw_json: { channel: "CAVU", mapping: "cavuV1" },
      customer_name: raw.customer_firstname
        ? `${raw.customer_firstname} ${raw.customer_lastname ?? ""}`.trim()
        : null,
    };
  });
}

describe("CAVU hourly duplicate dedupe + retry finalize", () => {
  it("collapses duplicate booking_reference rows before staging upsert", () => {
    const canonical = mapCavuHourlyCsv(CAVU_HOURLY_CSV);
    expect(canonical).toHaveLength(2);

    const stagingRaw = buildStagingFromCavuRows(canonical);
    const { rows, duplicateDedupeKeys, duplicateRowsCollapsed } =
      dedupeStagingRowsByKey(stagingRaw);

    expect(rows).toHaveLength(1);
    expect(duplicateDedupeKeys).toBe(1);
    expect(duplicateRowsCollapsed).toBe(1);
    expect(rows[0].start_at).toBe("2026-06-06T03:00:00.000Z");
  });

  it("builds parse_reason with duplicate_dedupe_keys after successful retry", () => {
    const parseReason = buildParseReasonSummary({
      rowsParsed: 2,
      rowsStaged: 1,
      rowsUpserted: 1,
      rowsCancelled: 0,
      rowsErrors: 0,
      duplicateDedupeKeys: 1,
    });

    expect(parseReason).toContain("rows_parsed=2");
    expect(parseReason).toContain("rows_staged=1");
    expect(parseReason).toContain("rows_upserted=1");
    expect(parseReason).toContain("rows_cancelled=0");
    expect(parseReason).toContain("rows_errors=0");
    expect(parseReason).toContain("duplicate_dedupe_keys=1");
  });

  it("prepare + finalize updates the same ingest_email_files row on retry", async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = {
      from: vi.fn(() => ({
        update: vi.fn((payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: {
                    id: FILE_ID,
                    parse_status: payload.parse_status,
                    parse_outcome: payload.parse_outcome,
                    parse_reason: payload.parse_reason,
                    parsed_at: payload.parsed_at,
                  },
                  error: null,
                })),
              })),
            })),
          };
        }),
      })),
    };

    await prepareIngestEmailFileForRetry(supabase as never, FILE_ID);

    const parseReason = buildParseReasonSummary({
      rowsParsed: 2,
      rowsStaged: 1,
      rowsUpserted: 1,
      rowsCancelled: 0,
      rowsErrors: 0,
      duplicateDedupeKeys: 1,
    });

    await finalizeIngestEmailFileParseSuccess(supabase as never, {
      fileId: FILE_ID,
      parseReason,
      parseOutcome: "parsed",
      parserKey: "cavu_email_import",
    });

    expect(updates[0]).toMatchObject({
      parse_status: "pending",
      parse_outcome: null,
      parse_error: null,
    });
    expect(updates[1]).toMatchObject({
      parse_status: "parsed",
      parse_outcome: "parsed",
      parse_error: null,
      parse_reason: parseReason,
    });
  });

  it("health banner only lists parse_status=failed files", () => {
    expect(
      isFileParseFailedForBanner({
        parse_status: "failed",
        parse_outcome: "failed",
      })
    ).toBe(true);
    expect(
      isFileParseFailedForBanner({
        parse_status: "parsed",
        parse_outcome: "failed",
      })
    ).toBe(false);
    expect(
      isFileParseFailedForBanner({
        parse_status: "parsed",
        parse_outcome: "parsed",
      })
    ).toBe(false);
    expect(
      isFileParseFailedForBanner({
        parse_status: "pending",
        parse_outcome: null,
      })
    ).toBe(false);
  });
});
