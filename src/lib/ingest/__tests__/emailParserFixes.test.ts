import { describe, it, expect } from "vitest";
import { extractTimeOfDay } from "@/lib/ingest/timeOfDay";
import {
  flyparksTextToStaging,
  getFlyparksRequiredMissing,
  looksLikeFlyparksDirectEmail,
} from "@/lib/ingest/flyparksTextToStaging";
import {
  cleanParkViaCustomerName,
  parkViaEmailBodyToStaging,
} from "@/lib/ingest/parkviaEmailBodyToStaging";
import { isPlaceholderPlate, normalizeLabeledPlate, normalizeUkPlate } from "@/lib/ingest/plateGuess";
import { detectAndMapFromAttachment } from "@/lib/importers/canonical/mappers";

describe("extractTimeOfDay (12h / 24h)", () => {
  it.each([
    ["9:15 PM", "21:15"],
    ["9:15 pm", "21:15"],
    ["2:30pm", "14:30"],
    ["1:30 PM", "13:30"],
    ["12:00 PM", "12:00"],
    ["12:05 AM", "00:05"],
    ["12:05 a.m.", "00:05"],
    ["11:59 p.m.", "23:59"],
    ["7:45am", "07:45"],
    ["13:45", "13:45"],
    ["09:15", "09:15"],
    ["00:30", "00:30"],
    ["13:30:00", "13:30"],
  ])("%s → %s", (input, expected) => {
    expect(extractTimeOfDay(input)).toBe(expected);
  });

  it("rejects invalid times", () => {
    expect(extractTimeOfDay("13:30 PM")).toBeNull();
    expect(extractTimeOfDay("24:00")).toBeNull();
    expect(extractTimeOfDay("10:75")).toBeNull();
    expect(extractTimeOfDay("no time")).toBeNull();
    expect(extractTimeOfDay(null)).toBeNull();
  });
});

const FLYPARKS_LABELLED = `Flyparks Booking Confirmation
Payment Reference: PAY998877
Booking Reference: FP12345
Departure date: 20/07/2026
Arrival time: 10:30 AM
Return date: 25/07/2026
Return time: 9:15 PM
Vehicle registration: WD12HBN
Total Cost: £1,110.00`;

describe("Flyparks parser fixes", () => {
  it("reads PM return times as afternoon/evening", () => {
    const r = flyparksTextToStaging(FLYPARKS_LABELLED);
    expect(r.start_at).toBe("2026-07-20T10:30:00");
    expect(r.end_at).toBe("2026-07-25T21:15:00");
  });

  it("parses '2:30pm' with no space in the new receipt format", () => {
    const r = flyparksTextToStaging(`***BOOKING RECEIPT***
YOUR BOOKING REFERENCE PF41180
Drop off date 20/07/2026
Drop off time 12:05am
Pick up date 25/07/2026
Pick up time 2:30pm
Vehicle Details: . . . WD12HBN
Total Cost £110.00`);
    expect(r.start_at).toBe("2026-07-20T00:05:00");
    expect(r.end_at).toBe("2026-07-25T14:30:00");
  });

  it("keeps 24h times working", () => {
    const r = flyparksTextToStaging(FLYPARKS_LABELLED.replace("9:15 PM", "21:15").replace("10:30 AM", "10:30"));
    expect(r.start_at).toBe("2026-07-20T10:30:00");
    expect(r.end_at).toBe("2026-07-25T21:15:00");
  });

  it("prefers Booking Reference over Payment Reference", () => {
    expect(flyparksTextToStaging(FLYPARKS_LABELLED).reference).toBe("FP12345");
    // Order in the email doesn't matter
    const swapped = FLYPARKS_LABELLED.replace("Payment Reference: PAY998877\nBooking Reference: FP12345", "Booking Reference: FP12345\nPayment Reference: PAY998877");
    expect(flyparksTextToStaging(swapped).reference).toBe("FP12345");
  });

  it("never uses a Payment Reference as the booking reference", () => {
    const r = flyparksTextToStaging(FLYPARKS_LABELLED.replace("Booking Reference: FP12345\n", ""));
    expect(r.reference).toBeNull();
  });

  it("still accepts a bare Reference label", () => {
    const r = flyparksTextToStaging(FLYPARKS_LABELLED.replace("Payment Reference: PAY998877\nBooking Reference: FP12345", "Reference: FP777"));
    expect(r.reference).toBe("FP777");
  });

  it("parses £ prices with thousands separators", () => {
    expect(flyparksTextToStaging(FLYPARKS_LABELLED).total_price).toBe(1110);
  });

  it("treats a 'TBC' registration as a blank plate but still books", () => {
    const r = flyparksTextToStaging(FLYPARKS_LABELLED.replace("WD12HBN", "TBC"));
    expect(r.vehicle_reg).toBeNull();
    expect(getFlyparksRequiredMissing(r)).toEqual([]);
    const noPlate = flyparksTextToStaging(FLYPARKS_LABELLED.replace("Vehicle registration: WD12HBN\n", ""));
    expect(getFlyparksRequiredMissing(noPlate)).toContain("vehicle_reg");
  });
});

const PARKVIA_BODY = [
  "ParkVia - New Booking Notification",
  "Your booking receipt",
  "Booking Ref: PV12345678",
  "Selected Car Park: Test Meet & Greet",
  "Total Price: £1,045.50",
  "Amount Paid: GBP 1,045.50",
  "Vehicle Drop-Off Date: 26/10/2026 1:30 PM",
  "Vehicle Pick-Up Date: 02/11/2026 12:15 AM",
  "Name: José Müller-Zoë",
  "Mobile: 07700900123",
  "Email: jose@example.com",
  "Registration Number: AB12 CDE",
  "Kind regards",
].join("\n");

describe("ParkVia parser fixes", () => {
  it("parses 12h times", () => {
    const r = parkViaEmailBodyToStaging(PARKVIA_BODY);
    expect(r.start_at).toBe("2026-10-26T13:30:00");
    expect(r.end_at).toBe("2026-11-02T00:15:00");
  });

  it("keeps 24h times working", () => {
    const r = parkViaEmailBodyToStaging(PARKVIA_BODY.replace("1:30 PM", "13:30").replace("12:15 AM", "09:00:00"));
    expect(r.start_at).toBe("2026-10-26T13:30:00");
    expect(r.end_at).toBe("2026-11-02T09:00:00");
  });

  it("keeps accented letters in names", () => {
    expect(parkViaEmailBodyToStaging(PARKVIA_BODY).customer_name).toBe("José Müller-Zoë");
    expect(cleanParkViaCustomerName("Siobhán O'Brien")).toBe("Siobhán O'Brien");
  });

  it("parses £ / GBP prices with commas", () => {
    const r = parkViaEmailBodyToStaging(PARKVIA_BODY);
    expect(r.total_price).toBe(1045.5);
    expect(r.money_received).toBe(1045.5);
  });

  it("treats placeholder plates as missing", () => {
    expect(parkViaEmailBodyToStaging(PARKVIA_BODY.replace("AB12 CDE", "TBC")).vehicle_reg).toBeNull();
    expect(parkViaEmailBodyToStaging(PARKVIA_BODY.replace("AB12 CDE", "N/A")).vehicle_reg).toBeNull();
  });

  it("is not routed to the Flyparks parser despite 'booking receipt'", () => {
    expect(looksLikeFlyparksDirectEmail("ParkVia - Notification", PARKVIA_BODY)).toBe(false);
    const detected = detectAndMapFromAttachment("email-body.txt", PARKVIA_BODY);
    expect(detected?.bookings[0].channel).toBe("PARKVIA_EMAIL");
    expect(detected?.bookings[0].booking_reference).toBe("PV12345678");
  });

  it("a generic 'booking receipt' without Flyparks markers is not Flyparks", () => {
    expect(looksLikeFlyparksDirectEmail("Your booking receipt", "Thanks for your booking receipt request.")).toBe(false);
  });
});

describe("placeholder plates", () => {
  it.each(["TBC", "tba", "TBD", "UNKNOWN", "Unknown", "N/A", "n/a", "NONE"])("%s is a placeholder", (v) => {
    expect(isPlaceholderPlate(v)).toBe(true);
    expect(normalizeLabeledPlate(v)).toBeNull();
    expect(normalizeUkPlate(v)).toBeNull();
  });

  it("real plates still pass", () => {
    expect(isPlaceholderPlate("WD12HBN")).toBe(false);
    expect(normalizeLabeledPlate("WD12 HBN")).toBe("WD12HBN");
    expect(normalizeLabeledPlate("123")).toBe("123");
  });
});
