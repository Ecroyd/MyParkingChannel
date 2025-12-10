// src/lib/pricing/stayLength.test.ts

import { calculateStayDays } from "./stayLength";

describe("calculateStayDays", () => {
  test("exact 10 days", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-20T11:50:00Z");
    expect(calculateStayDays(start, end)).toBe(10);
  });

  test("10 days + 1 minute (should ceil to 11 days)", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-20T11:51:00Z");
    expect(calculateStayDays(start, end)).toBe(11);
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

  test("less than 1 day (should ceil to 1 day)", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-10T12:00:00Z"); // 10 minutes later
    expect(calculateStayDays(start, end)).toBe(1);
  });

  test("exactly 1 day", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-11T11:50:00Z");
    expect(calculateStayDays(start, end)).toBe(1);
  });

  test("1 day + 1 second (should ceil to 2 days)", () => {
    const start = new Date("2025-12-10T11:50:00Z");
    const end = new Date("2025-12-11T11:50:01Z");
    expect(calculateStayDays(start, end)).toBe(2);
  });
});

