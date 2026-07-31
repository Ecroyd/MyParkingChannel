// src/lib/pricing/stayLength.test.ts

import { calculateStayDays } from "./stayLength";

describe("calculateStayDays", () => {
  test("inclusive calendar days: 10 Dec → 20 Dec = 11 days", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-20T11:50:00Z");
    expect(calculateStayDays(start, end)).toBe(11);
  });

  test("later return time on the same leave date does not add a day", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-20T11:51:00Z");
    expect(calculateStayDays(start, end)).toBe(11);
  });

  test("Jun 1 → Jun 8 is 8 inclusive days", () => {
    const start = new Date("2026-06-01T03:00:00Z");
    const end = new Date("2026-06-08T13:00:00Z");
    expect(calculateStayDays(start, end, "Europe/London")).toBe(8);
  });

  test("week away Mon→Mon is 8 inclusive days even if return is later", () => {
    const start = new Date("2026-03-02T10:00:00Z"); // Mon
    const end = new Date("2026-03-09T18:00:00Z"); // next Mon, later
    expect(calculateStayDays(start, end)).toBe(8);
  });

  test("identical timestamps (should return 1 day minimum)", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-10T11:50:00Z");
    expect(calculateStayDays(start, end)).toBe(1);
  });

  test("end before start (should return 1 day minimum)", () => {
    const start = new Date("2025-12-20T11:50:00Z");
    const end = new Date("2025-12-10T11:50:00Z");
    expect(calculateStayDays(start, end)).toBe(1);
  });

  test("same calendar day (should return 1 day)", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-10T12:00:00Z");
    expect(calculateStayDays(start, end)).toBe(1);
  });

  test("next calendar day is 2 inclusive days", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-11T11:50:00Z");
    expect(calculateStayDays(start, end)).toBe(2);
  });

  test("next calendar day with later time is still 2 days", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-11T11:50:01Z");
    expect(calculateStayDays(start, end)).toBe(2);
  });

  test("uses tenant timezone around midnight (London)", () => {
    // 23:30 UTC on 10 Dec = 23:30 London (GMT) → 10 Dec
    // 00:30 UTC on 11 Dec = 00:30 London → 11 Dec → 2 inclusive days
    const start = new Date("2025-12-10T23:30:00Z");
    const end = new Date("2025-12-11T00:30:00Z");
    expect(calculateStayDays(start, end, "Europe/London")).toBe(2);
  });
});
