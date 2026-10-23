import { describe, it, expect } from "vitest";
import { isCancellationSubject } from "../emailCancellation";

describe("isCancellationSubject", () => {
  it.each([
    "Booking Cancellation - FPX12345",
    "Your booking has been cancelled",
    "ParkVia: Booking Canceled",
    "CANX notification 12345",
    "Cancelled: Reservation ABC123",
    "Booking Cancelation - FP12345",
    "Booking cancel notification",
  ])("detects %s", (s) => expect(isCancellationSubject(s)).toBe(true));

  it.each([
    "Booking Confirmation - ***BOOKING RECEIPT***",
    "New booking ABC123",
    "Booking amended",
    "Free cancellation policy reminder",
    "Your booking was not cancelled",
    "Booking confirmed - free cancellation up to 24h",
    "Re: Flyparks Booking Confirmation - can I cancel?",
    "How to cancel your booking",
    "Booking confirmation incl. cancellation cover",
    "",
    null,
  ])("ignores %s", (s) => expect(isCancellationSubject(s as string | null)).toBe(false));
});
