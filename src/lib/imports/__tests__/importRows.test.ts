import { describe, it, expect } from "vitest";
import { buildImportRows, dedupeByReference } from "@/lib/imports/buildRows";
import { looksLikeHeaderRow } from "@/lib/imports/header";
import { mapImportStatus } from "@/lib/imports/normalise";
import { normalisePhoneUK } from "@/lib/imports/utils";
import {
  buildImportUpdatePayload,
  pickExistingMatch,
  type ExistingBooking,
} from "@/lib/imports/mergeExisting";
import type { ImportProfileMap } from "@/lib/imports/types";

const MAP: ImportProfileMap = {
  reference: "A",
  customer_name: "B",
  start_date: "C",
  start_time: "D",
  end_date: "E",
  end_time: "F",
  status: "G",
  price: "H",
  phone: "I",
};

const HEADER = ["Reference", "Name", "Start Date", "Start Time", "End Date", "End Time", "Status", "Price", "Phone"];

describe("mapImportStatus", () => {
  it("maps cancellations in any form", () => {
    for (const s of ["Cancelled", "CANCELLED", "canceled", "*CANX*", "No Show", "no-show", "NOSHOW", "Refunded", "REFUND"]) {
      expect(mapImportStatus(s), s).toBe("cancelled");
    }
  });
  it("maps live statuses to reserved and empty to null", () => {
    for (const s of ["Confirmed", "FIRM", "*AMND*", "Amended", "NEW", "Booked"]) {
      expect(mapImportStatus(s), s).toBe("reserved");
    }
    expect(mapImportStatus("")).toBeNull();
    expect(mapImportStatus(undefined)).toBeNull();
  });
});

describe("looksLikeHeaderRow", () => {
  it("detects a header", () => {
    expect(looksLikeHeaderRow(HEADER)).toBe(true);
    expect(looksLikeHeaderRow(["Booking Reference", "Customer Name", "Vehicle Reg"])).toBe(true);
  });
  it("does not treat text-heavy data rows as headers", () => {
    expect(looksLikeHeaderRow(["FLY123", "John Smith", "25/10/2026", "09:30", "01/11/2026", "18:00", "Confirmed", "£12.50", "07700900123"])).toBe(false);
  });
  it("an all-text first row is a header guess the operator can untick", () => {
    expect(looksLikeHeaderRow(["ABC", "Mary Jones", "Ford", "Focus", "Blue", "Confirmed"])).toBe(true);
  });
});

describe("buildImportRows", () => {
  it("only the first row can be the header; text-heavy data rows are kept", () => {
    const rows = [
      HEADER,
      ["R1", "Mary Jones", "01/02/2026", "9:15 PM", "08/02/2026", "10:00", "Confirmed", "£12.50", "07700900123"],
      ["Reference", "Name", "x", "x", "x", "x", "x", "x", "x"], // looks like a header but is row 3: error, not silently dropped
    ];
    const r = buildImportRows(rows, MAP, { hasHeader: true, source: "other" });
    expect(r.headerSkipped).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].rowNumber).toBe(3);
    const b = r.rows[0];
    expect(b.start_at).toBe("2026-02-01T21:15:00");
    expect(b.end_at).toBe("2026-02-08T10:00:00");
    expect(b.status).toBe("Confirmed");
    expect(b.price).toBe(12.5);
    expect(b.phone).toBe("+447700900123");
    expect(b._rawRow).toBeUndefined();
  });

  it("per-row error for an invalid date does not kill the whole preview", () => {
    const rows = [
      ["R1", "A B", "05/13/2026", "09:00", "20/05/2026", "09:00", "", "", ""],
      ["R2", "C D", "31/02/2026", "09:00", "20/05/2026", "09:00", "", "", ""],
      ["R3", "E F", "05/05/2026", "09:00", "20/05/2026", "09:00", "", "", ""],
      ["R4", "G H", "20/05/2026", "09:00", "05/05/2026", "09:00", "", "", ""],
    ];
    const r = buildImportRows(rows, MAP, { hasHeader: false, source: "other" });
    expect(r.rows.map((x) => x.reference)).toEqual(["R3"]);
    expect(r.errors.map((e) => e.reference)).toEqual(["R1", "R2", "R4"]);
    expect(r.errors[2].reason).toMatch(/end is before start/);
  });

  it("money: £, thousands, decimal comma, 0 kept, empty null, garbage is an error", () => {
    const row = (ref: string, price: unknown) => [ref, "A B", "05/05/2026", "09:00", "06/05/2026", "09:00", "", price, ""];
    const r = buildImportRows(
      [row("P1", "£12.50"), row("P2", "1,234.00"), row("P3", "12,50"), row("P4", "0"), row("P5", ""), row("P6", 0), row("P7", "abc"), row("P8", "-")],
      MAP,
      { hasHeader: false, source: "other" }
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.reference, x.price]))).toEqual({
      P1: 12.5, P2: 1234, P3: 12.5, P4: 0, P5: null, P6: 0, P8: null,
    });
    expect(r.errors.map((e) => e.reference)).toEqual(["P7"]);
  });

  it("Excel cells: serial date + time fraction + numeric phone", () => {
    const rows = [["X1", "A B", 46320, 0.375, 46327, 0.75, "", 15, 7700900123]];
    const r = buildImportRows(rows, MAP, { hasHeader: false, source: "other" });
    expect(r.rows[0].start_at).toBe("2026-10-25T09:00:00");
    expect(r.rows[0].end_at).toBe("2026-11-01T18:00:00");
    expect(r.rows[0].phone).toBe("+447700900123");
    expect(r.rows[0].price).toBe(15);
  });

  it("combined timestamp column", () => {
    const map: ImportProfileMap = { reference: "A", start_timestamp: "B", end_timestamp: "C" };
    const r = buildImportRows([["T1", "25/10/2026 09:30", "01/11/2026 21:15"]], map, { hasHeader: false, source: "other" });
    expect(r.errors).toEqual([]);
    expect(r.rows[0].start_at).toBe("2026-10-25T09:30:00");
  });

  it("duplicate references in one file: last row wins, earlier rows reported", () => {
    const row = (ref: string, time: string) => [ref, "A B", "05/05/2026", time, "06/05/2026", "09:00", "", "", ""];
    const r = buildImportRows([row("D1", "08:00"), row("D2", "08:00"), row("d1", "11:00")], MAP, {
      hasHeader: false,
      source: "other",
      rowNumbers: [2, 3, 5],
    });
    expect(r.rows.map((x) => [x.reference, x.start_at])).toEqual([
      ["D2", "2026-05-05T08:00:00"],
      ["D1", "2026-05-05T11:00:00"],
    ]);
    expect(r.duplicates).toEqual([
      { rowNumber: 2, reference: "D1", reason: "duplicate reference in file; row 5 used instead" },
    ]);
  });

  it("includes the raw row only when asked (Holiday Extras)", () => {
    const rows = [["H1", "A B", "05/05/2026", "09:00", "06/05/2026", "09:00", "", "", ""]];
    expect(buildImportRows(rows, MAP, { hasHeader: false, source: "x", includeRawRow: true }).rows[0]._rawRow).toEqual(rows[0]);
  });
});

describe("dedupeByReference", () => {
  it("keeps unique rows untouched", () => {
    const { kept, duplicates } = dedupeByReference([{ reference: "A" }, { reference: "B" }]);
    expect(kept).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});

describe("normalisePhoneUK", () => {
  it("restores a dropped leading zero only for numeric cells", () => {
    expect(normalisePhoneUK(7700900123)).toBe("+447700900123");
    expect(normalisePhoneUK("1392123456", { fromNumericCell: true })).toBe("+441392123456");
    expect(normalisePhoneUK("07700900123")).toBe("+447700900123");
    expect(normalisePhoneUK("+44 7700 900123")).toBe("+447700900123");
  });
});

describe("existing booking merge", () => {
  const existing = (over: Partial<ExistingBooking> = {}): ExistingBooking => ({
    id: "b1", reference: "R1", source: "other", status: "reserved",
    gate_status: "reserved", ops_status: "reserved", anpr_status: "not_arrived", ...over,
  });
  const payload = {
    tenant_id: "t", reference: "R1", source: "other", external_source: "unknown",
    customer_name: "Mary Jones", customer_email: "", customer_phone: null, plate: "AB12CDE",
    start_at: "2026-10-25T09:30:00.000Z", end_at: "2026-11-01T09:30:00.000Z",
    status: "reserved", external_status: "CONFIRMED", money_charged: 0, money_received: 0,
    notes: "", is_incomplete: false, missing_fields: [],
  };

  it("pickExistingMatch: single match any channel, exact source when ambiguous", () => {
    expect(pickExistingMatch([], "R1", "other").kind).toBe("none");
    expect(pickExistingMatch([existing({ source: "holiday_extras" })], "r1", "other").kind).toBe("match");
    const two = [existing({ id: "a", source: "cavu" }), existing({ id: "b", source: "other" })];
    const m = pickExistingMatch(two, "R1", "other");
    expect(m.kind === "match" && m.booking.id).toBe("b");
    expect(pickExistingMatch(two, "R1", "parkvia").kind).toBe("ambiguous");
  });

  it("does not blank fields, zero money, or touch attribution/ops fields", () => {
    const { update } = buildImportUpdatePayload(existing(), payload, {
      newStatus: "reserved", priceGiven: false, receivedGiven: false, nameMissing: false,
    });
    for (const k of ["tenant_id", "reference", "source", "external_source", "money_charged", "money_received", "customer_email", "customer_phone", "notes", "gate_status", "ops_status", "anpr_status"]) {
      expect(update, k).not.toHaveProperty(k);
    }
    expect(update.status).toBe("reserved");
    expect(update.plate).toBe("AB12CDE");
  });

  it("keeps £0 when the cell had 0", () => {
    const { update } = buildImportUpdatePayload(existing(), payload, {
      newStatus: null, priceGiven: true, receivedGiven: true, nameMissing: false,
    });
    expect(update.money_charged).toBe(0);
    expect(update).not.toHaveProperty("status");
  });

  it("never downgrades checked_in / checked_out, never re-activates cancelled", () => {
    for (const status of ["checked_in", "checked_out", "cancelled"]) {
      const { update, warnings } = buildImportUpdatePayload(existing({ status }), payload, {
        newStatus: "reserved", priceGiven: false, receivedGiven: false, nameMissing: false,
      });
      expect(update, status).not.toHaveProperty("status");
      expect(warnings).toHaveLength(1);
    }
  });

  it("a cancellation applies even to a checked-in booking and sets ops fields", () => {
    const { update } = buildImportUpdatePayload(existing({ status: "checked_in" }), { ...payload, status: "cancelled" }, {
      newStatus: "cancelled", priceGiven: false, receivedGiven: false, nameMissing: false,
    });
    expect(update).toMatchObject({ status: "cancelled", gate_status: "cancelled", ops_status: "cancelled" });
    expect(update).not.toHaveProperty("anpr_status");
  });

  it("does not overwrite a real name with the missing-name placeholder", () => {
    const { update } = buildImportUpdatePayload(existing(), { ...payload, is_incomplete: true }, {
      newStatus: null, priceGiven: false, receivedGiven: false, nameMissing: true,
    });
    expect(update).not.toHaveProperty("customer_name");
    expect(update).not.toHaveProperty("is_incomplete");
  });
});
