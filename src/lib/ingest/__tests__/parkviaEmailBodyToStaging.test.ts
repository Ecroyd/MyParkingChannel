import { describe, expect, it } from "vitest";
import {
  looksLikeParkViaEmail,
  parkViaEmailBodyToStaging,
} from "@/lib/ingest/parkviaEmailBodyToStaging";

const PARKVIA_SAMPLE = `
ParkVia - New Booking Notification

Booking Ref: PC90172652
Selected Car Park: FLYPARKS
Total Price: 76.93
Amount Paid: 76.93
Amount Due: 0.00
Booking Options: Parking
Vehicle Drop-Off Date: 06/07/2026 04:00:00
Vehicle Pick-Up Date: 10/07/2026 13:30:00
Passengers: 2
Name: Graham Nesbitt
Mobile: 07818091766(+44)
Email: graham@example.com
Registration Number: C14 ELF
`;

describe("parkViaEmailBodyToStaging", () => {
  it("detects ParkVia by source, subject, or body", () => {
    expect(looksLikeParkViaEmail({ from_address: "alerts@parkvia.com" })).toBe(true);
    expect(looksLikeParkViaEmail({ subject: "ParkVia - Notification" })).toBe(true);
    expect(looksLikeParkViaEmail({ body: PARKVIA_SAMPLE })).toBe(true);
  });

  it("parses the ParkVia sample into staging fields", () => {
    const row = parkViaEmailBodyToStaging(PARKVIA_SAMPLE);
    expect(row.reference).toBe("PC90172652");
    expect(row.customer_name).toBe("Graham Nesbitt");
    expect(row.customer_email).toBe("graham@example.com");
    expect(row.customer_phone).toBe("0781809176644");
    expect(row.vehicle_reg).toBe("C14ELF");
    expect(row.start_at).toBe("2026-07-06T04:00:00");
    expect(row.end_at).toBe("2026-07-10T13:30:00");
    expect(row.total_price).toBe(76.93);
    expect(row.money_received).toBe(76.93);
    expect(row.product_code).toBe("Parking");
    expect(row.notes).toContain("Selected car park: FLYPARKS");
    expect(row.notes).toContain("Amount due: 0.00");
    expect(row.notes).toContain("Passengers: 2");
  });
});
