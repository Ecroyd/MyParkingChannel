import { describe, expect, it } from "vitest";
import {
  flyparksTextToStaging,
  getFlyparksRequiredMissing,
  looksLikeFlyparksDirectEmail,
  normalizeFlyparksEmailText,
} from "@/lib/ingest/flyparksTextToStaging";

const bookingFields = `
Thank you for your booking with Flyparks

Your details: Jane Croydon
Email: jane@example.com
Phone: 07123 456 789
Departure date: 12/07/2026
Arrival time: 08:30
Return date: 19/07/2026
Return time: 18:45
Return flight number: EZY123
Vehicle model: Ford Focus
Vehicle colour: Blue
Vehicle registration: AB12 CDE
Reference: 123456
Parking Cost: £55.00
Total Cost: £65.00
Product: Meet and Greet
`;

describe("flyparksTextToStaging", () => {
  it("parses clean client Flyparks Payment Successful email", () => {
    const subject = "FW: Flyparks Payment Successful";
    const body = `Flyparks Payment Successful\n${bookingFields}`;

    expect(looksLikeFlyparksDirectEmail(subject, body)).toBe(true);

    const staging = flyparksTextToStaging(body);
    expect(staging.reference).toBe("123456");
    expect(staging.start_at).toBe("2026-07-12T08:30:00");
    expect(staging.end_at).toBe("2026-07-19T18:45:00");
    expect(staging.vehicle_reg).toBe("AB12CDE");
    expect(staging.customer_name).toBe("Jane Croydon");
    expect(staging.customer_email).toBe("jane@example.com");
    expect(staging.customer_phone).toBe("07123456789");
    expect(staging.total_price).toBe(65);
    expect(staging.product_code).toBe("Meet and Greet");
    expect(getFlyparksRequiredMissing(staging)).toEqual([]);
  });

  it("parses Gmail nested forward for Flyparks Payment Successful", () => {
    const subject = "Fwd: FW: Flyparks Payment Successful";
    const body = `
Hi,

---------- Forwarded message ---------
From: James <jcecroyd@gmail.com>
Date: Thu, 11 Jun 2026 at 10:00
Subject: FW: Flyparks Payment Successful

---------- Forwarded message ---------
From: Flyparks Exeter Ltd Website <info@flyparksexeter.co.uk>
Subject: Flyparks Payment Successful

Your transaction has been completed
${bookingFields}
`;

    expect(looksLikeFlyparksDirectEmail(subject, normalizeFlyparksEmailText(body))).toBe(true);
    const staging = flyparksTextToStaging(body);
    expect(staging.reference).toBe("123456");
    expect(staging.start_at).toBe("2026-07-12T08:30:00");
    expect(staging.vehicle_reg).toBe("AB12CDE");
    expect(getFlyparksRequiredMissing(staging)).toEqual([]);
  });

  it("parses alternate Flyparks Booking Confirmation template", () => {
    const subject = "Fwd: FW: Flyparks Booking Confirmation";
    const body = `
---------- Forwarded message ---------
From: Flyparks Exeter Ltd Website <info@flyparksexeter.co.uk>
Subject: Flyparks Booking Confirmation

Booking Reference: 987654
${bookingFields.replace("Reference: 123456", "")}
`;

    expect(looksLikeFlyparksDirectEmail(subject, body)).toBe(true);
    const staging = flyparksTextToStaging(body);
    expect(staging.reference).toBe("987654");
    expect(staging.start_at).toBe("2026-07-12T08:30:00");
    expect(staging.end_at).toBe("2026-07-19T18:45:00");
    expect(staging.vehicle_reg).toBe("AB12CDE");
  });

  it("parses labels separated by blank lines", () => {
    const body = `
Flyparks Booking Confirmation

Reference:

555111

Departure Date:

01/08/2026

Arrival Time:

09:05

Return Date:

08/08/2026

Return Time:

21:10

Vehicle Registration:

CD34 EFG

Total Cost:

£72.50
`;

    const staging = flyparksTextToStaging(body);
    expect(staging.reference).toBe("555111");
    expect(staging.start_at).toBe("2026-08-01T09:05:00");
    expect(staging.end_at).toBe("2026-08-08T21:10:00");
    expect(staging.vehicle_reg).toBe("CD34EFG");
    expect(staging.total_price).toBe(72.5);
    expect(getFlyparksRequiredMissing(staging)).toEqual([]);
  });

  it("parses Gmail nested Payment Successful forwards with markdown-wrapped labels", () => {
    const subject = "Fwd: FW: Flyparks Payment Successful";
    const body = `
---------- Forwarded message ---------
From: James <jcecroyd@gmail.com>
Subject: FW: Flyparks Payment Successful

---------- Forwarded message ---------
From: Flyparks Exeter Ltd Website <info@flyparksexeter.co.uk>
Subject: Flyparks Payment Successful

Your transaction has been completed

*Reference:* 40765
*Your details:* Test Customer
*Departure date:* 08/06/2026
*Arrival time:* 10:00
*Return date:* 22/06/2026
*Return time:* 23:00
*Vehicle model:* Ford Focus
*Vehicle colour:* Back
*Vehicle registration:* FP65UMW
*Parking Cost:* £200.99
*Total Cost:* £200.99
`;

    expect(looksLikeFlyparksDirectEmail(subject, body)).toBe(true);
    const staging = flyparksTextToStaging(body);
    expect(staging.reference).toBe("40765");
    expect(staging.start_at).toBe("2026-06-08T10:00:00");
    expect(staging.end_at).toBe("2026-06-22T23:00:00");
    expect(staging.vehicle_reg).toBe("FP65UMW");
    expect(staging.vehicle_colour).toBe("Back");
    expect(staging.total_price).toBe(200.99);
    expect(getFlyparksRequiredMissing(staging)).toEqual([]);
  });

  it("parses PF Booking Confirmation forwards with vehicle details line", () => {
    const subject = "Fwd: FW: Flyparks Booking Confirmation";
    const body = `
---------- Forwarded message ---------
From: James <jcecroyd@gmail.com>
Subject: FW: Flyparks Booking Confirmation

---------- Forwarded message ---------
From: Flyparks Exeter Ltd Website <info@flyparksexeter.co.uk>
Subject: Flyparks Booking Confirmation

Linda Wilson

YOUR BOOKING REFERENCE *PF41017*

Name: Linda Wilson
Drop off date 08/06/2026
Drop off time 11:55
Pick up date 13/06/2026
Pick up time 14:30
Vehicle Details: NISSAN QASHQAI grey WD21HRX
Car Parking £95.00
Total Cost £95.00
`;

    expect(looksLikeFlyparksDirectEmail(subject, body)).toBe(true);
    const staging = flyparksTextToStaging(body);
    expect(staging.reference).toBe("PF41017");
    expect(staging.customer_name).toBe("Linda Wilson");
    expect(staging.start_at).toBe("2026-06-08T11:55:00");
    expect(staging.end_at).toBe("2026-06-13T14:30:00");
    expect(staging.vehicle_reg).toBe("WD21HRX");
    expect(staging.vehicle_colour).toBe("grey");
    expect(staging.vehicle_make).toBe("NISSAN");
    expect(staging.vehicle_model).toBe("QASHQAI");
    expect(staging.total_price).toBe(95);
    expect(getFlyparksRequiredMissing(staging)).toEqual([]);
  });
});
