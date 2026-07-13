import { describe, expect, it } from "vitest";
import {
  customerNameLooksContaminated,
  normalizePhoneDigits,
  splitCustomerDetailsBlock,
} from "@/lib/ingest/customerContactDetails";
import { flyparksTextToStaging } from "@/lib/ingest/flyparksTextToStaging";

function assertCleanCustomerFields(staging: {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
}) {
  expect(customerNameLooksContaminated(staging.customer_name)).toBe(false);
  if (staging.customer_email) {
    expect(staging.customer_name ?? "").not.toContain(staging.customer_email);
  }
  if (staging.customer_phone) {
    expect(staging.customer_name ?? "").not.toMatch(/0\d{9,10}|\+44/);
  }
}

describe("splitCustomerDetailsBlock", () => {
  it("splits name, email and phone on separate lines", () => {
    expect(
      splitCustomerDetailsBlock("Davies\njudithdavies89@aol.co.uk\n07747600434")
    ).toEqual({
      name: "Davies",
      email: "judithdavies89@aol.co.uk",
      phone: "07747600434",
    });
  });

  it("splits name, email and phone on one line", () => {
    expect(
      splitCustomerDetailsBlock("Davies judithdavies89@aol.co.uk 07747600434")
    ).toEqual({
      name: "Davies",
      email: "judithdavies89@aol.co.uk",
      phone: "07747600434",
    });
  });

  it("preserves full first and last name", () => {
    expect(
      splitCustomerDetailsBlock("Jane Croydon\njane@example.com\n07123 456 789")
    ).toEqual({
      name: "Jane Croydon",
      email: "jane@example.com",
      phone: "07123456789",
    });
  });

  it("normalises +44 phone format", () => {
    expect(normalizePhoneDigits("+44 7747 600434")).toBe("+447747600434");
    expect(splitCustomerDetailsBlock("Davies judithdavies89@aol.co.uk +44 7747 600434")).toEqual({
      name: "Davies",
      email: "judithdavies89@aol.co.uk",
      phone: "+447747600434",
    });
  });

  it("handles phone containing spaces", () => {
    expect(splitCustomerDetailsBlock("Smith\nsmith@example.com\n07747 600 434")).toEqual({
      name: "Smith",
      email: "smith@example.com",
      phone: "07747600434",
    });
  });

  it("handles missing telephone", () => {
    expect(splitCustomerDetailsBlock("Davies\njudithdavies89@aol.co.uk")).toEqual({
      name: "Davies",
      email: "judithdavies89@aol.co.uk",
      phone: null,
    });
  });

  it("handles missing email", () => {
    expect(splitCustomerDetailsBlock("Davies\n07747600434")).toEqual({
      name: "Davies",
      email: null,
      phone: "07747600434",
    });
  });

  it("leaves a clean name unchanged", () => {
    expect(splitCustomerDetailsBlock("Jane Croydon")).toEqual({
      name: "Jane Croydon",
      email: null,
      phone: null,
    });
  });
});

const baseBookingTail = `
Departure date: 12/07/2026
Arrival time: 08:30
Return date: 19/07/2026
Return time: 18:45
Vehicle registration: AB12 CDE
Reference: DAV001
Total Cost: £65.00
`;

describe("flyparksTextToStaging customer contact extraction", () => {
  it("1. name, email and phone on separate lines under Your details", () => {
    const staging = flyparksTextToStaging(`
Flyparks Payment Successful
Your details:
Davies
judithdavies89@aol.co.uk
07747600434
${baseBookingTail}
`);
    expect(staging.customer_name).toBe("Davies");
    expect(staging.customer_email).toBe("judithdavies89@aol.co.uk");
    expect(staging.customer_phone).toBe("07747600434");
    assertCleanCustomerFields(staging);
  });

  it("2. name, email and phone on one line under Your details", () => {
    const staging = flyparksTextToStaging(`
Flyparks Payment Successful
Your details: Davies judithdavies89@aol.co.uk 07747600434
${baseBookingTail}
`);
    expect(staging.customer_name).toBe("Davies");
    expect(staging.customer_email).toBe("judithdavies89@aol.co.uk");
    expect(staging.customer_phone).toBe("07747600434");
    assertCleanCustomerFields(staging);
  });

  it("3. full first and last name preserved", () => {
    const staging = flyparksTextToStaging(`
Flyparks Payment Successful
Your details:
Jane Croydon
jane@example.com
07123 456 789
${baseBookingTail}
`);
    expect(staging.customer_name).toBe("Jane Croydon");
    expect(staging.customer_email).toBe("jane@example.com");
    expect(staging.customer_phone).toBe("07123456789");
    assertCleanCustomerFields(staging);
  });

  it("4. +44 phone format", () => {
    const staging = flyparksTextToStaging(`
Flyparks Payment Successful
Your details: Davies judithdavies89@aol.co.uk +44 7747 600434
${baseBookingTail}
`);
    expect(staging.customer_name).toBe("Davies");
    expect(staging.customer_email).toBe("judithdavies89@aol.co.uk");
    expect(staging.customer_phone).toBe("+447747600434");
    assertCleanCustomerFields(staging);
  });

  it("5. phone containing spaces", () => {
    const staging = flyparksTextToStaging(`
Flyparks Payment Successful
Your details:
Davies
judithdavies89@aol.co.uk
07747 600 434
${baseBookingTail}
`);
    expect(staging.customer_name).toBe("Davies");
    expect(staging.customer_phone).toBe("07747600434");
    assertCleanCustomerFields(staging);
  });

  it("6. missing telephone", () => {
    const staging = flyparksTextToStaging(`
Flyparks Payment Successful
Your details:
Davies
judithdavies89@aol.co.uk
${baseBookingTail}
`);
    expect(staging.customer_name).toBe("Davies");
    expect(staging.customer_email).toBe("judithdavies89@aol.co.uk");
    expect(staging.customer_phone).toBeNull();
    assertCleanCustomerFields(staging);
  });

  it("7. missing email", () => {
    const staging = flyparksTextToStaging(`
Flyparks Payment Successful
Your details:
Davies
07747600434
${baseBookingTail}
`);
    expect(staging.customer_name).toBe("Davies");
    expect(staging.customer_phone).toBe("07747600434");
    assertCleanCustomerFields(staging);
  });

  it("8. forwarded email with quoted headers", () => {
    const staging = flyparksTextToStaging(`
Hi,

---------- Forwarded message ---------
From: Ops <ops@example.com>
Date: Mon, 13 Jul 2026 at 10:00
Subject: FW: Flyparks Payment Successful

> ---------- Forwarded message ---------
> From: Flyparks Exeter Ltd Website <info@flyparksexeter.co.uk>
> Subject: Flyparks Payment Successful
>
> Your transaction has been completed
> Your details:
> Davies
> judithdavies89@aol.co.uk
> 07747600434
> Departure date: 12/07/2026
> Arrival time: 08:30
> Return date: 19/07/2026
> Return time: 18:45
> Vehicle registration: AB12 CDE
> Reference: DAV001
> Total Cost: £65.00
`);
    expect(staging.customer_name).toBe("Davies");
    expect(staging.customer_email).toBe("judithdavies89@aol.co.uk");
    expect(staging.customer_phone).toBe("07747600434");
    expect(staging.reference).toBe("DAV001");
    assertCleanCustomerFields(staging);
  });

  it("9. customer name that contains no email or phone", () => {
    const staging = flyparksTextToStaging(`
Flyparks Payment Successful
Your details: Davies
${baseBookingTail}
`);
    expect(staging.customer_name).toBe("Davies");
    expect(staging.customer_email).toBeNull();
    expect(staging.customer_phone).toBeNull();
    assertCleanCustomerFields(staging);
  });

  it("10. existing correctly parsed direct booking remains unchanged", () => {
    const staging = flyparksTextToStaging(`
Flyparks Payment Successful
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
`);
    expect(staging.customer_name).toBe("Jane Croydon");
    expect(staging.customer_email).toBe("jane@example.com");
    expect(staging.customer_phone).toBe("07123456789");
    expect(staging.reference).toBe("123456");
    assertCleanCustomerFields(staging);
  });
});
