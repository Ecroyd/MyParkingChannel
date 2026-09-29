import { describe, it, expect } from "vitest";
import { mapAphCsvLike, detectAndMapFromAttachment } from "../mappers";
import { extractAphCsvFromText } from "@/lib/importers/aph/extractAphCsvFromText";

describe("APH sample booking NCY3S / GM14WSY", () => {
  const sampleRow =
    `"0  ","NEW    ","NCY3S  ","                   ","30/09/26","Mr  ","M","GM14WSY   ","VOLVO     ","GREY      "," 1","19:45","       ","0000061.04","       ","03/10/26","15:00","       "," "," ","    ","Wheeler             ","27/09/26","00:00","                                                            "," ","TE","","","    ","    ","","07973433237"`;

  it("parses reference, plate, times, name and phone from the live sample row", () => {
    const result = mapAphCsvLike(sampleRow);
    expect(result).toHaveLength(1);
    const b = result[0];
    expect(b.booking_reference).toBe("NCY3S");
    expect(b.vehicle_registration).toBe("GM14WSY");
    expect(b.vehicle_make).toBe("VOLVO");
    expect(b.vehicle_colour).toBe("GREY");
    expect(b.customer_firstname).toBe("M");
    expect(b.customer_lastname).toBe("Wheeler");
    expect(b.customer_phone).toBe("07973433237");
    expect(b.start_at).toBe("2026-09-30T19:45:00");
    expect(b.end_at).toBe("2026-10-03T15:00:00");
    expect(b.total_price).toBe(61.04);
    expect(String((b.raw as any).external_status)).toBe("NEW");
  });

  it("extracts the CSV row when buried in a forwarded email body", () => {
    const body = [
      "---------- Forwarded message ---------",
      "From: Aph Bookings <bookings@example.com>",
      "Subject: APH bookings",
      "",
      sampleRow,
      "",
      "Thanks,",
      "Ops",
    ].join("\n");

    const extracted = extractAphCsvFromText(body);
    expect(extracted).toContain("NCY3S");

    const detected = detectAndMapFromAttachment("forwarded.eml", body);
    expect(detected).not.toBeNull();
    expect(detected!.bookings).toHaveLength(1);
    expect(detected!.bookings[0].booking_reference).toBe("NCY3S");
    expect(detected!.bookings[0].customer_phone).toBe("07973433237");
  });
});
