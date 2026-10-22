import { describe, it, expect } from "vitest";
import { isCancellationSubject } from "../emailCancellation";

describe("isCancellationSubject", () => {
  it.each([
    "Booking Cancellation - FPX12345",
    "Your booking has been cancelled",
    "ParkVia: Booking Canceled",
    "CANX notification 12345",
    "Cancelled: Reservation ABC123",
  ])("detects %s", (s) => expect(isCancellationSubject(s)).toBe(true));

  it.each([
    "Booking Confirmation - ***BOOKING RECEIPT***",
    "New booking ABC123",
    "Booking amended",
    "Free cancellation policy reminder",
    "Your booking was not cancelled",
    "",
    null,
  ])("ignores %s", (s) => expect(isCancellationSubject(s as string | null)).toBe(false));
});
