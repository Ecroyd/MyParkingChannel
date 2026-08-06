import { describe, it, expect } from "vitest";
import {
  detectAndMapFromAttachment,
  looksLikeLooking4OrdersCsv,
  mapLooking4OrdersCsv,
} from "../mappers";
import { channelToParserKey, getAttribution } from "@/lib/importAttribution";
import { mapSupplierStatusToBookingStatus } from "@/lib/ingest/importStatusMapping";
import { parseSupplierDateTimeToUtc } from "@/lib/datetime/parse";

const LOOKING4_CSV = `Reference,Order Price,Drop Off Date/Time,Return Date/Time,Car Reg,Status,Order Date,Departure Flight Number,Departure Terminal,Return Flight Number,Return Terminal,Make,Model,Car Colour,Contact Number,No of Passengers,Third Party Reference,Customer Full Name,Transaction Currency,Product Native Currency,Product Native Price,Purchase Model,Deposit Amount,Car Park Balance
JPL-1-7625802,108.10,2026/08/21 13:00:00,2026/08/26 22:00:00,WL14BGK,AMENDMENT,2026/08/05 13:38:22,FR2797,,FR2796,,Vauxhall,Insignia,Black,+447723916453,1,,Peter Bastin,GBP,GBP,108.10,FullPrice,0.00,0.00
`;

const LOOKING4_EMPTY = `Reference,Order Price,Drop Off Date/Time,Return Date/Time,Car Reg,Status,Order Date,Departure Flight Number,Departure Terminal,Return Flight Number,Return Terminal,Make,Model,Car Colour,Contact Number,No of Passengers,Third Party Reference,Customer Full Name,Transaction Currency,Product Native Currency,Product Native Price,Purchase Model,Deposit Amount,Car Park Balance
`;

describe("Looking4 OrdersPlacedToday CSV", () => {
  it("detects OrdersPlacedToday filename", () => {
    expect(
      looksLikeLooking4OrdersCsv("OrdersPlacedToday_2356-20260805150044.csv", "x")
    ).toBe(true);
  });

  it("detects Looking4 header content", () => {
    expect(looksLikeLooking4OrdersCsv("report.csv", LOOKING4_CSV)).toBe(true);
  });

  it("parses slash datetime as London local → UTC", () => {
    expect(parseSupplierDateTimeToUtc("2026/08/21 13:00:00")).toBe(
      "2026-08-21T12:00:00.000Z"
    );
  });

  it("maps booking fields and AMENDMENT status", () => {
    const rows = mapLooking4OrdersCsv(LOOKING4_CSV);
    expect(rows).toHaveLength(1);
    const b = rows[0];
    expect(b.channel).toBe("LOOKING4");
    expect(b.booking_reference).toBe("JPL-1-7625802");
    expect(b.vehicle_registration).toBe("WL14BGK");
    expect(b.vehicle_make).toBe("Vauxhall");
    expect(b.vehicle_model).toBe("Insignia");
    expect(b.vehicle_colour).toBe("Black");
    expect(b.customer_firstname).toBe("Peter");
    expect(b.customer_lastname).toBe("Bastin");
    expect(b.customer_phone).toBe("+447723916453");
    expect(b.outbound_flight_number).toBe("FR2797");
    expect(b.return_flight_number).toBe("FR2796");
    expect(b.total_price).toBe(108.1);
    expect(b.currency).toBe("GBP");
    // Naive London-local ISO; promotion converts to UTC
    expect(b.start_at).toBe("2026-08-21T13:00:00");
    expect(b.end_at).toBe("2026-08-26T22:00:00");
    expect(b.raw.external_status).toBe("AMENDMENT");
    expect(mapSupplierStatusToBookingStatus(b.raw.external_status)).toBe("reserved");
  });

  it("auto-detects from filename and content", () => {
    const result = detectAndMapFromAttachment(
      "OrdersPlacedToday_2356-20260805150044.csv",
      LOOKING4_CSV
    );
    expect(result).not.toBeNull();
    expect(result!.bookings).toHaveLength(1);
    expect(result!.bookings[0].channel).toBe("LOOKING4");
    expect(channelToParserKey("LOOKING4")).toBe("looking4_email_import");
    expect(getAttribution("looking4_email_import")).toMatchObject({
      bookingSource: "cavu",
      externalSource: "looking4",
      detectedSource: "LOOKING4",
    });
  });

  it("returns empty bookings for header-only OrdersPlacedToday", () => {
    const result = detectAndMapFromAttachment(
      "OrdersPlacedToday_2356-20260805140039.csv",
      LOOKING4_EMPTY
    );
    expect(result).not.toBeNull();
    expect(result!.bookings).toHaveLength(0);
  });
});
