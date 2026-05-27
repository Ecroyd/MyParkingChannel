import { describe, it, expect } from "vitest";
import { resolveParseOutcome } from "../parseOutcome";

describe("resolveParseOutcome", () => {
  it("returns empty when no rows accepted or staged", () => {
    expect(
      resolveParseOutcome({
        rowsAccepted: 0,
        rowsStaged: 0,
        rowsUpserted: 0,
        rowsCancelled: 0,
      })
    ).toBe("empty");
  });

  it("returns parsed when cancelled rows staged even if upsert count is only cancellations", () => {
    expect(
      resolveParseOutcome({
        rowsAccepted: 5,
        rowsStaged: 5,
        rowsUpserted: 0,
        rowsCancelled: 5,
      })
    ).toBe("parsed");
  });

  it("returns parsed when staging has rows", () => {
    expect(
      resolveParseOutcome({
        rowsAccepted: 3,
        rowsStaged: 3,
        rowsUpserted: 2,
        rowsCancelled: 1,
      })
    ).toBe("parsed");
  });
});
