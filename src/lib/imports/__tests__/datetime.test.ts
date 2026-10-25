import { describe, it, expect } from "vitest";
import {
  composeLocalDateTime,
  excelSerialToParts,
  parseDateValue,
  parseTimeValue,
} from "@/lib/imports/datetime";
import { parseNaiveLocalIsoToUtc, resolveBookingTimesToUtc } from "@/lib/datetime/parse";

const ok = (r: ReturnType<typeof composeLocalDateTime>) => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("composeLocalDateTime – UK day/month", () => {
  it("reads DD/MM/YYYY day-first for days 1-12", () => {
    expect(ok(composeLocalDateTime("01/02/2026", "09:30"))).toBe("2026-02-01T09:30:00");
    expect(ok(composeLocalDateTime("12/11/2026"))).toBe("2026-11-12T00:00:00");
    expect(ok(composeLocalDateTime("25/10/2026", "9:05"))).toBe("2026-10-25T09:05:00");
  });

  it("reads two-digit years and dash/dot separators day-first", () => {
    expect(ok(composeLocalDateTime("01/02/26"))).toBe("2026-02-01T00:00:00");
    expect(ok(composeLocalDateTime("01-02-2026"))).toBe("2026-02-01T00:00:00");
    expect(ok(composeLocalDateTime("01.02.2026"))).toBe("2026-02-01T00:00:00");
  });

  it("accepts YYYY-MM-DD and ISO", () => {
    expect(ok(composeLocalDateTime("2026-02-01", "14:00"))).toBe("2026-02-01T14:00:00");
    expect(ok(composeLocalDateTime("2026-05-01 03:00:00"))).toBe("2026-05-01T03:00:00");
    expect(ok(composeLocalDateTime("2026-05-01T03:00:00.000Z"))).toBe("2026-05-01T03:00:00");
  });

  it("converts an explicit UTC offset to London wall-clock time", () => {
    expect(ok(composeLocalDateTime("2026-07-01T08:00:00+00:00"))).toBe("2026-07-01T09:00:00");
  });

  it("accepts month names", () => {
    expect(ok(composeLocalDateTime("25 Oct 2026", "21:15"))).toBe("2026-10-25T21:15:00");
    expect(ok(composeLocalDateTime("1-Feb-26"))).toBe("2026-02-01T00:00:00");
  });

  it("rejects invalid calendar dates instead of rolling over", () => {
    for (const bad of ["31/02/2026", "05/13/2026", "29/02/2026", "00/01/2026", "2026-13-01"]) {
      const r = composeLocalDateTime(bad);
      expect(r.ok, bad).toBe(false);
    }
    expect(ok(composeLocalDateTime("29/02/2028"))).toBe("2028-02-29T00:00:00");
  });

  it("rejects out-of-range years and garbage without throwing", () => {
    expect(composeLocalDateTime("01/01/1999").ok).toBe(false);
    expect(composeLocalDateTime("next tuesday").ok).toBe(false);
    expect(composeLocalDateTime("").ok).toBe(false);
  });
});

describe("combined timestamp columns", () => {
  it("parses DD/MM/YYYY HH:mm[:ss]", () => {
    expect(ok(composeLocalDateTime("25/10/2026 09:30"))).toBe("2026-10-25T09:30:00");
    expect(ok(composeLocalDateTime("25/10/2026 09:30:15"))).toBe("2026-10-25T09:30:15");
    expect(ok(composeLocalDateTime("01/02/2026, 9:15 PM"))).toBe("2026-02-01T21:15:00");
  });

  it("a separate time column overrides the embedded time", () => {
    expect(ok(composeLocalDateTime("25/10/2026 00:00", "14:45"))).toBe("2026-10-25T14:45:00");
  });

  it("an unparseable time is an error, not silently midnight", () => {
    expect(composeLocalDateTime("25/10/2026", "lunchtime").ok).toBe(false);
    expect(composeLocalDateTime("25/10/2026 25:00").ok).toBe(false);
  });
});

describe("parseTimeValue", () => {
  const t = (v: string | number) => {
    const r = parseTimeValue(v);
    if (!r || !r.ok) throw new Error(`failed ${v}`);
    return `${r.value.h}:${r.value.mi}:${r.value.s}`;
  };
  it("24-hour variants", () => {
    expect(t("09:30")).toBe("9:30:0");
    expect(t("9:30")).toBe("9:30:0");
    expect(t("21:15:45")).toBe("21:15:45");
    expect(t("9.30")).toBe("9:30:0");
    expect(t("0930")).toBe("9:30:0");
  });
  it("12-hour variants", () => {
    expect(t("9:15 PM")).toBe("21:15:0");
    expect(t("9:15pm")).toBe("21:15:0");
    expect(t("12:00 AM")).toBe("0:0:0");
    expect(t("12:30 pm")).toBe("12:30:0");
    expect(t("7am")).toBe("7:0:0");
    expect(parseTimeValue("13:00 pm")?.ok).toBe(false);
  });
  it("Excel time fractions and serials", () => {
    expect(t(0.375)).toBe("9:0:0");
    expect(t(0.5)).toBe("12:0:0");
    expect(t(0.25)).toBe("6:0:0");
    expect(t("0.375")).toBe("9:0:0");
    expect(t(46320.395833333336)).toBe("9:30:0");
    expect(t(0.999999)).toBe("23:59:59");
    expect(t(930)).toBe("9:30:0");
  });
  it("empty is null, invalid is an error", () => {
    expect(parseTimeValue("")).toBeNull();
    expect(parseTimeValue("24:00")?.ok).toBe(false);
    expect(parseTimeValue("9.3")?.ok).toBe(false);
  });
});

describe("Excel serials", () => {
  it("converts date serials without timezone drift", () => {
    expect(excelSerialToParts(46320)).toEqual({ date: { y: 2026, m: 10, d: 25 }, time: { h: 0, mi: 0, s: 0 } });
    expect(ok(composeLocalDateTime(46320))).toBe("2026-10-25T00:00:00");
    expect(ok(composeLocalDateTime(46110, 0.375))).toBe("2026-03-29T09:00:00");
  });
  it("date-time serials keep their time", () => {
    expect(ok(composeLocalDateTime(46320.395833333336))).toBe("2026-10-25T09:30:00");
    expect(ok(composeLocalDateTime("46143.125"))).toBe("2026-05-01T03:00:00");
  });
  it("ddmmyy digits (Excel dropped the leading zero)", () => {
    expect(ok(composeLocalDateTime("010226"))).toBe("2026-02-01T00:00:00");
    expect(ok(composeLocalDateTime("51026"))).toBe("2026-10-05T00:00:00");
  });
  it("does not depend on the process timezone", () => {
    const before = process.env.TZ;
    try {
      process.env.TZ = "America/New_York";
      expect(ok(composeLocalDateTime(46320.395833333336))).toBe("2026-10-25T09:30:00");
      process.env.TZ = "Asia/Tokyo";
      expect(ok(composeLocalDateTime("25/10/2026", "9:30 AM"))).toBe("2026-10-25T09:30:00");
    } finally {
      process.env.TZ = before;
    }
  });
});

describe("DST: naive London time → UTC on the server", () => {
  it("25 Oct 2026 (clocks go back at 02:00 BST)", () => {
    expect(parseNaiveLocalIsoToUtc(ok(composeLocalDateTime("24/10/2026", "09:30")))).toBe("2026-10-24T08:30:00.000Z");
    expect(parseNaiveLocalIsoToUtc(ok(composeLocalDateTime("25/10/2026", "09:30")))).toBe("2026-10-25T09:30:00.000Z");
  });
  it("29 Mar 2026 (clocks go forward at 01:00 GMT)", () => {
    expect(parseNaiveLocalIsoToUtc(ok(composeLocalDateTime("28/03/2026", "09:30")))).toBe("2026-03-28T09:30:00.000Z");
    expect(parseNaiveLocalIsoToUtc(ok(composeLocalDateTime("29/03/2026", "09:30")))).toBe("2026-03-29T08:30:00.000Z");
  });
  it("server resolver accepts the naive strings the upload screen sends", () => {
    const r = resolveBookingTimesToUtc(
      ok(composeLocalDateTime("25/10/2026 09:30")),
      ok(composeLocalDateTime("01/11/2026", "9:15 PM")),
      "Europe/London"
    );
    expect(r).toEqual({ start_at: "2026-10-25T09:30:00.000Z", end_at: "2026-11-01T21:15:00.000Z" });
  });
});

describe("parseDateValue", () => {
  it("returns null for empty and keeps embedded time", () => {
    expect(parseDateValue("")).toBeNull();
    const r = parseDateValue("25/10/2026 09:30");
    expect(r?.ok && r.value.time).toEqual({ h: 9, mi: 30, s: 0 });
  });
});
