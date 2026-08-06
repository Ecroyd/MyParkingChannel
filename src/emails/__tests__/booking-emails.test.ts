import { describe, expect, it } from "vitest";
import { renderBookingConfirmationEmail } from "@/emails/BookingConfirmationEmail";
import { renderTenantBookingNotificationEmail } from "@/emails/TenantBookingNotificationEmail";

describe("booking emails", () => {
  it("renders a professional customer confirmation with key details", () => {
    const html = renderBookingConfirmationEmail({
      bookingReference: "FPE-12345",
      customerName: "Jane Smith",
      customerEmail: "jane@example.com",
      customerPhone: "+441234567890",
      plate: "AB12CDE",
      flightNumber: "BE3101",
      startAt: "2026-08-10T10:00:00.000Z",
      endAt: "2026-08-17T18:00:00.000Z",
      amount: 49.5,
      currency: "GBP",
      tenantName: "Fly Parks Exeter",
      siteUrl: "https://parkingexeterairport.co.uk/",
      manageBookingUrl: "https://parkingexeterairport.co.uk/manage-booking",
      directionsUrl: "https://parkingexeterairport.co.uk/directions",
      contactEmail: "info@flyparksexeter.co.uk",
      addressLine: "Exeter International Airport, Exeter, EX5 2BD",
    });

    expect(html).toContain("Booking confirmed");
    expect(html).toContain("FPE-12345");
    expect(html).toContain("AB12CDE");
    expect(html).toContain("BE3101");
    expect(html).toContain("Manage booking");
    expect(html).toContain("Get directions");
    expect(html).toContain("£49.50");
    expect(html).toContain("Fly Parks Exeter");
    expect(html).not.toContain("<script");
  });

  it("renders tenant notification with customer and booking details", () => {
    const html = renderTenantBookingNotificationEmail({
      bookingReference: "FPE-12345",
      customerName: "Jane Smith",
      customerEmail: "jane@example.com",
      plate: "AB12CDE",
      startAt: "2026-08-10T10:00:00.000Z",
      endAt: "2026-08-17T18:00:00.000Z",
      amount: 49.5,
      tenantName: "Fly Parks Exeter",
      adminBookingsUrl: "https://myparkingchannel.app/admin/bookings",
      source: "Website",
    });

    expect(html).toContain("New booking received");
    expect(html).toContain("FPE-12345");
    expect(html).toContain("Jane Smith");
    expect(html).toContain("jane@example.com");
    expect(html).toContain("Open bookings");
  });
});
