import { describe, expect, it } from "vitest";
import {
  flyparksTextToStaging,
  getFlyparksRequiredMissing,
  looksLikeFlyparksDirectEmail,
  normalizeFlyparksEmailText,
} from "@/lib/ingest/flyparksTextToStaging";
import { guessFlyparksFields } from "@/lib/email/flyparksForward";
import {
  buildBookingPayloadFromStaging,
  type StagingRow,
} from "@/lib/ingest/bookingFromStaging";
import {
  formatBookingDateTimeForTenant,
  resolveBookingTimesToUtc,
} from "@/lib/datetime/parse";
import { toBookingInsertPayload } from "@/lib/ingest/safeBookingUpsertPayload";

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

  it("parses PF41125 Flyparks Payment Successful with Dear-line surname and vehicle details", () => {
    const subject = "FW: Flyparks Payment Successful";
    const body = `
Booking Confirmation - ***BOOKING RECEIPT***

Reference: PF41125

Dear Creanor,

To: siobhan.creanor@hotmail.co.uk

Drop off date: 28/06/2026
Drop off time: 04:00
Pick up date: 02/07/2026
Pick up time: 22:00
Return flight number: TOM6481
Vehicle Details: Skoda Karoq White Sm67kfg
Car Parking: £89.00
Total Cost: £89.00
`;

    expect(looksLikeFlyparksDirectEmail(subject, body)).toBe(true);

    const receipt = normalizeFlyparksEmailText(body);
    const plateGuess = guessFlyparksFields(receipt);
    expect(plateGuess.plate).toBe("SM67KFG");
    expect(plateGuess.plate).not.toBe("BOOKING");

    const staging = flyparksTextToStaging(body);
    expect(staging.reference).toBe("PF41125");
    expect(staging.customer_name).toBe("Creanor");
    expect(staging.customer_email).toBe("siobhan.creanor@hotmail.co.uk");
    expect(staging.vehicle_reg).toBe("SM67KFG");
    expect(staging.vehicle_make).toBe("Skoda");
    expect(staging.vehicle_model).toBe("Karoq");
    expect(staging.vehicle_colour).toBe("White");
    expect(staging.flight_number).toBe("TOM6481");
    expect(staging.money_charged).toBe(89);
    expect(staging.money_received).toBe(89);
    expect(staging.start_at).toBe("2026-06-28T04:00:00");
    expect(staging.end_at).toBe("2026-07-02T22:00:00");
    expect(getFlyparksRequiredMissing(staging)).toEqual([]);

    const utc = resolveBookingTimesToUtc(staging.start_at!, staging.end_at!, "Europe/London");
    expect(utc?.start_at).toBe("2026-06-28T03:00:00.000Z");
    expect(utc?.end_at).toBe("2026-07-02T21:00:00.000Z");
    expect(formatBookingDateTimeForTenant({ timestamp: utc?.start_at, timezone: "Europe/London" })).toContain("04:00");
    expect(formatBookingDateTimeForTenant({ timestamp: utc?.end_at, timezone: "Europe/London" })).toContain("22:00");

    const row: StagingRow = {
      tenant_id: "tenant-test",
      reference: staging.reference,
      external_reference: staging.reference,
      external_status: "RESERVED",
      status: "reserved",
      start_at: staging.start_at,
      end_at: staging.end_at,
      vehicle_reg: staging.vehicle_reg,
      vehicle_make: staging.vehicle_make,
      vehicle_model: staging.vehicle_model,
      vehicle_colour: staging.vehicle_colour,
      customer_name: staging.customer_name,
      customer_email: staging.customer_email,
      return_flight_no: staging.flight_number,
      price: staging.money_charged,
      money_received: staging.money_received,
      source: "direct",
      raw_json: staging.raw_json,
    };

    const payload = buildBookingPayloadFromStaging(row, {
      start_at: utc!.start_at,
      end_at: utc!.end_at,
    });

    expect(payload.customer_name).toBe("Creanor");
    expect(payload.customer_email).toBe("siobhan.creanor@hotmail.co.uk");
    expect(payload.plate).toBe("SM67KFG");
    expect(payload.external_status).toBe("RESERVED");
    expect(payload.external_source).toBe("flyparks_email_text");
    expect(payload.source).toBe("direct");
    expect(payload.gate_status).toBe("reserved");
    expect(payload.ops_status).toBe("reserved");
    expect(payload.anpr_status).toBe("not_arrived");
    expect(payload.return_flight_number).toBe("TOM6481");
    expect(payload.money_charged).toBe(89);
    expect(payload.money_received).toBe(89);
    expect(payload).not.toHaveProperty("supplier_status");

    const safe = toBookingInsertPayload({
      ...payload,
      tenant_id: "tenant-test",
      reference: "PF41125",
    });
    expect(safe.ok).toBe(true);
    if (safe.ok) {
      expect(safe.data).not.toHaveProperty("supplier_status");
      expect(safe.data.external_status).toBe("RESERVED");
      expect(safe.data.customer_name).toBe("Creanor");
      expect(safe.data.plate).toBe("SM67KFG");
      expect(safe.data.start_at).toBe("2026-06-28T03:00:00.000Z");
      expect(safe.data.end_at).toBe("2026-07-02T21:00:00.000Z");
    }
  });

  it("never produces null customer_name when only Dear-line surname is present", () => {
    const staging = flyparksTextToStaging(`
Dear Creanor,
Reference: PF41125
Drop off date: 28/06/2026
Drop off time: 04:00
Pick up date: 02/07/2026
Pick up time: 22:00
Vehicle Details: Skoda Karoq White Sm67kfg
Total Cost: £89.00
`);

    expect(staging.customer_name).toBe("Creanor");

    const utc = resolveBookingTimesToUtc(staging.start_at!, staging.end_at!, "Europe/London");
    const payload = buildBookingPayloadFromStaging(
      {
        tenant_id: "tenant-test",
        reference: staging.reference,
        external_status: "RESERVED",
        start_at: staging.start_at,
        end_at: staging.end_at,
        vehicle_reg: staging.vehicle_reg,
        customer_name: staging.customer_name,
        customer_email: "siobhan.creanor@hotmail.co.uk",
        source: "direct",
        raw_json: staging.raw_json,
      },
      { start_at: utc!.start_at, end_at: utc!.end_at }
    );

    expect(payload.customer_name).toBe("Creanor");
    expect(payload.customer_name).not.toBeNull();
    expect(payload).not.toHaveProperty("supplier_status");
  });

  it("parses PF40926 Flyparks Payment Successful with Dear-line fallback", () => {
    const body = `
Booking Confirmation - ***BOOKING RECEIPT***
Reference: PF40926
Dear Smith,
To: jane.smith@example.com
Drop off date: 15/06/2026
Drop off time: 09:30
Pick up date: 20/06/2026
Pick up time: 18:00
Vehicle Details: Ford Fiesta Blue AB12CDE
Total Cost: £75.00
`;

    const staging = flyparksTextToStaging(body);
    expect(staging.reference).toBe("PF40926");
    expect(staging.customer_name).toBe("Smith");
    expect(staging.customer_email).toBe("jane.smith@example.com");
    expect(staging.vehicle_reg).toBe("AB12CDE");

    const utc = resolveBookingTimesToUtc(staging.start_at!, staging.end_at!, "Europe/London");
    const payload = buildBookingPayloadFromStaging(
      {
        tenant_id: "tenant-test",
        reference: staging.reference,
        external_status: "RESERVED",
        start_at: staging.start_at,
        end_at: staging.end_at,
        vehicle_reg: staging.vehicle_reg,
        customer_name: staging.customer_name,
        customer_email: staging.customer_email,
        source: "direct",
        raw_json: staging.raw_json,
      },
      { start_at: utc!.start_at, end_at: utc!.end_at }
    );

    expect(payload.customer_name).not.toBeNull();
    expect(payload).not.toHaveProperty("supplier_status");

    const safe = toBookingInsertPayload({
      ...payload,
      tenant_id: "tenant-test",
      reference: "PF40926",
    });
    expect(safe.ok).toBe(true);
    if (safe.ok) {
      expect(safe.data).not.toHaveProperty("supplier_status");
      expect(safe.data.customer_name).toBe("Smith");
    }
  });

  it("parses PF40926 with email-only customer name (keristorey5@gmail.com)", () => {
    const body = `
Booking Confirmation - ***BOOKING RECEIPT***
Reference: PF40926
To: keristorey5@gmail.com
Drop off date: 15/06/2026
Drop off time: 05:45
Pick up date: 22/06/2026
Pick up time: 23:25
Return flight number: TOM6129
Vehicle Details: mazda red WA20HWM
Total Cost: £137.99
`;

    const staging = flyparksTextToStaging(body);
    expect(staging.reference).toBe("PF40926");
    expect(staging.customer_name).toBe("Keristorey");
    expect(staging.customer_email).toBe("keristorey5@gmail.com");
    expect(staging.vehicle_reg).toBe("WA20HWM");
    expect(staging.flight_number).toBe("TOM6129");
    expect(staging.money_received).toBe(137.99);

    const utc = resolveBookingTimesToUtc(staging.start_at!, staging.end_at!, "Europe/London");
    const payload = buildBookingPayloadFromStaging(
      {
        tenant_id: "tenant-test",
        reference: staging.reference,
        external_status: "RESERVED",
        start_at: staging.start_at,
        end_at: staging.end_at,
        vehicle_reg: staging.vehicle_reg,
        vehicle_model: staging.vehicle_model,
        vehicle_colour: staging.vehicle_colour,
        customer_name: staging.customer_name,
        return_flight_no: staging.flight_number,
        price: staging.money_received,
        money_received: staging.money_received,
        source: "direct",
        raw_json: staging.raw_json,
      },
      { start_at: utc!.start_at, end_at: utc!.end_at }
    );

    expect(payload.customer_name).toBe("Keristorey");
    expect(payload.customer_email).toBe("keristorey5@gmail.com");
    expect(payload.plate).toBe("WA20HWM");
    expect(payload.return_flight_number).toBe("TOM6129");
    expect(payload).not.toHaveProperty("supplier_status");
  });
});
