import { describe, expect, it } from "vitest";
import { guessFlyparksFields } from "@/lib/email/flyparksForward";
import { guessPlateFromEmailText } from "@/lib/ingest/plateGuess";

describe("guessPlateFromEmailText", () => {
  it("ignores BOOKING RECEIPT words and returns null when no plate", () => {
    const text = "Booking Confirmation - ***BOOKING RECEIPT***\nPayment Successful";
    expect(guessPlateFromEmailText(text)).toBeNull();
    expect(guessFlyparksFields(text).plate).toBeUndefined();
  });

  it("extracts plate from Vehicle Details line", () => {
    const text = "Vehicle Details: Skoda Karoq White Sm67kfg";
    expect(guessPlateFromEmailText(text)).toBe("SM67KFG");
  });

  it("extracts standard UK plate from registration label", () => {
    const text = "Vehicle registration: AB12 CDE";
    expect(guessPlateFromEmailText(text)).toBe("AB12CDE");
  });
});
