import { describe, expect, it } from "vitest";
import {
  cleanParkViaCustomerName,
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

const ELIZABETH_HENSON_SAMPLE = `
ParkVia
ParkVia - New Booking Notification

Booking Ref: PC90491696
Selected Car Park: FLYPARKS
Total Price: 56.35
Amount Paid: 56.35
Amount Due: 0.00

ANY SPECIAL REQUESTS:
Booking Options: Parking
Vehicle Drop-Off Date: 14/08/2026 16:30:00
Vehicle Pick-Up Date: 16/08/2026 18:30:00
Passengers: 1
Name: Elizabeth Henson
Mobile: 7412487775(+44)
Email: elizabeth.henson@example.com
Registration Number: HK69PYU
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
    expect(row.customer_phone).toBe("07818091766");
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

  it("parses Elizabeth Henson PC90491696 sample cleanly", () => {
    const row = parkViaEmailBodyToStaging(ELIZABETH_HENSON_SAMPLE);
    expect(row.reference).toBe("PC90491696");
    expect(row.customer_name).toBe("Elizabeth Henson");
    expect(row.customer_email).toBe("elizabeth.henson@example.com");
    expect(row.customer_phone).toBe("7412487775");
    expect(row.vehicle_reg).toBe("HK69PYU");
    expect(row.start_at).toBe("2026-08-14T16:30:00");
    expect(row.end_at).toBe("2026-08-16T18:30:00");
    expect(row.total_price).toBe(56.35);
    expect(row.money_received).toBe(56.35);
    expect(row.customer_name).not.toMatch(/parkvia|regards|http/i);
  });

  it("does not let Name swallow footer / signature / notification text", () => {
    const body = `
ParkVia - New Booking Notification
Booking Ref: PC90491696
Selected Car Park: FLYPARKS
Total Price: 56.35
Amount Paid: 56.35
Amount Due: 0.00
Booking Options: Parking
Vehicle Drop-Off Date: 14/08/2026 16:30:00
Vehicle Pick-Up Date: 16/08/2026 18:30:00
Passengers: 1
Name: Elizabeth Henson
Kind regards,
FlyParks Exeter
https://www.flyparksexeter.co.uk
From: ParkVia
Sent: 09 August 2026 08:09
To: info@flyparksexeter.co.uk
Subject: ParkVia - Notification
ParkVia - New Booking Notification
`;

    const row = parkViaEmailBodyToStaging(body);
    expect(row.reference).toBe("PC90491696");
    expect(row.customer_name).toBe("Elizabeth Henson");
    expect(row.vehicle_reg).toBeNull();
    expect(row.customer_name?.length ?? 0).toBeLessThan(40);
    expect(row.customer_name).not.toMatch(/regards|flyparks|http|notification|subject/i);
  });

  it("handles HTML table emails and text+html duplication without contaminating Name", () => {
    const html = `
<html><body>
<p>ParkVia - New Booking Notification</p>
<table>
<tr><td>Booking Ref:</td><td>PC90491696</td></tr>
<tr><td>Selected Car Park:</td><td>FLYPARKS</td></tr>
<tr><td>Total Price:</td><td>56.35</td></tr>
<tr><td>Amount Paid:</td><td>56.35</td></tr>
<tr><td>Amount Due:</td><td>0.00</td></tr>
<tr><td>Booking Options:</td><td>Parking</td></tr>
<tr><td>Vehicle Drop-Off Date:</td><td>14/08/2026 16:30:00</td></tr>
<tr><td>Vehicle Pick-Up Date:</td><td>16/08/2026 18:30:00</td></tr>
<tr><td>Passengers:</td><td>1</td></tr>
<tr><td>Name:</td><td>Elizabeth Henson</td></tr>
<tr><td>Mobile:</td><td>7412487775(+44)</td></tr>
<tr><td>Email:</td><td>elizabeth.henson@example.com</td></tr>
<tr><td>Registration Number:</td><td>HK69PYU</td></tr>
</table>
<p>Kind regards,<br/>FlyParks Exeter</p>
<p><a href="https://www.flyparksexeter.co.uk">https://www.flyparksexeter.co.uk</a></p>
</body></html>
`;
    // Mimic processIngestEmail joining text + html when text is truncated after Name.
    const truncatedText = `
ParkVia - New Booking Notification
Booking Ref: PC90491696
Selected Car Park: FLYPARKS
Total Price: 56.35
Amount Paid: 56.35
Amount Due: 0.00
Booking Options: Parking
Vehicle Drop-Off Date: 14/08/2026 16:30:00
Vehicle Pick-Up Date: 16/08/2026 18:30:00
Passengers: 1
Name: Elizabeth Henson
`;
    const joined = `${truncatedText}\n${html}`;
    const row = parkViaEmailBodyToStaging(joined);

    expect(row.reference).toBe("PC90491696");
    expect(row.customer_name).toBe("Elizabeth Henson");
    expect(row.vehicle_reg).toBe("HK69PYU");
    expect(row.customer_email).toBe("elizabeth.henson@example.com");
    expect(row.customer_name).not.toMatch(/parkvia|regards|http|flyparks|notification/i);
  });

  it("cleanParkViaCustomerName strips contaminated tails", () => {
    expect(
      cleanParkViaCustomerName(
        "Elizabeth Henson ParkVia Notification ParkVia New Booking Kind regards, FlyParks Exeter https://www.flyparksexeter.co.uk"
      )
    ).toBe("Elizabeth Henson");
    expect(cleanParkViaCustomerName("Elizabeth Henson")).toBe("Elizabeth Henson");
    expect(cleanParkViaCustomerName(null)).toBeNull();
  });
});
