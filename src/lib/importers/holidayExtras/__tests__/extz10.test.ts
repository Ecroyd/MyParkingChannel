import { describe, expect, it } from "vitest";
import {
  looksLikeExtz10Tab,
  parseHolidayExtrasExtz10Text,
} from "../parseHolidayExtras";
import { detectAndMapFromAttachment } from "@/lib/importers/canonical/mappers";

const EXTZ10_ROW =
  "06\t1\tKXBZFQ\tMATTHEWSON     \t260927\tMRS \tL\t 2\t0400\t261005\tEXTPIM\tLP\t0000105.32\t\tN\t1330\t    \tDS62WXZ   \t 8\tVAUXHALL\tINSIGNIA\tGREY\t07454012123\t\t0\t0";

describe("Holiday Extras EXTZ10 parser", () => {
  it("detects EXTZ10 by filename or first row layout", () => {
    expect(looksLikeExtz10Tab("EXTZ10160626.txt", EXTZ10_ROW)).toBe(true);
    expect(looksLikeExtz10Tab("upload.txt", EXTZ10_ROW)).toBe(true);
    expect(detectAndMapFromAttachment("EXTZ10160626.txt", EXTZ10_ROW)?.bookings).toHaveLength(1);
  });

  it("parses KXBZFQ action 1 as a reserved booking", () => {
    const { bookings, stats } = parseHolidayExtrasExtz10Text(EXTZ10_ROW);
    expect(stats.rows_accepted).toBe(1);
    const booking = bookings[0];
    expect(booking.booking_reference).toBe("KXBZFQ");
    expect(booking.raw.external_status).toBe("new");
    expect(booking.raw.mapped_status).toBe("reserved");
  });

  it("uses hotel date + one day for local arrival and preserves return local time", () => {
    const { bookings } = parseHolidayExtrasExtz10Text(EXTZ10_ROW);
    expect(bookings[0].start_at).toBe("2026-09-28T04:00:00");
    expect(bookings[0].end_at).toBe("2026-10-05T13:30:00");
  });

  it("normalises vehicle registration and parses money", () => {
    const { bookings } = parseHolidayExtrasExtz10Text(EXTZ10_ROW);
    expect(bookings[0].vehicle_registration).toBe("DS62WXZ");
    expect(bookings[0].total_price).toBe(105.32);
    expect(bookings[0].money_received).toBe(105.32);
    expect(bookings[0].money_charged).toBe(105.32);
  });

  it("maps amendments and cancellations", () => {
    const amended = EXTZ10_ROW.replace("\t1\tKXBZFQ\t", "\t2\tKXBZFQ\t");
    const cancelled = EXTZ10_ROW.replace("\t1\tKXBZFQ\t", "\t3\tKXBZFQ\t");
    expect(parseHolidayExtrasExtz10Text(amended).bookings[0].raw.external_status).toBe("amended");
    expect(parseHolidayExtrasExtz10Text(cancelled).bookings[0].raw.external_status).toBe("cancelled");
    expect(parseHolidayExtrasExtz10Text(cancelled).bookings[0].raw.mapped_status).toBe("cancelled");
  });
});
