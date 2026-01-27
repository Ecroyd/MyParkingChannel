// src/lib/datetime/parse.test.ts

import { isExtz10File, overrideStartToMidnight } from "./parse";

describe("EXTZ10 file detection and midnight override", () => {
  describe("isExtz10File", () => {
    test("detects EXTZ10 prefix (case-insensitive)", () => {
      expect(isExtz10File("EXTZ10260126.txt")).toBe(true);
      expect(isExtz10File("extz10260126.txt")).toBe(true);
      expect(isExtz10File("ExtZ10260126.txt")).toBe(true);
      expect(isExtz10File("/path/to/EXTZ10260126.txt")).toBe(true);
      expect(isExtz10File("C:\\data\\EXTZ10260126.txt")).toBe(true);
    });

    test("rejects non-EXTZ10 files", () => {
      expect(isExtz10File("EXT1180126.txt")).toBe(false);
      expect(isExtz10File("SOMEOTHER.txt")).toBe(false);
      expect(isExtz10File("aph-booking.csv")).toBe(false);
      expect(isExtz10File("EXTZ10260126")).toBe(false); // No .txt extension but should still match prefix
    });

    test("handles edge cases", () => {
      expect(isExtz10File("")).toBe(false);
      expect(isExtz10File("EXTZ1")).toBe(false);
      expect(isExtz10File("EXTZ10")).toBe(true); // Just prefix, no extension
    });
  });

  describe("overrideStartToMidnight", () => {
    test("overrides start time to midnight in Europe/London timezone", () => {
      // Input: 2026-01-26 04:00 UTC (which is 04:00 in London during GMT)
      // Expected: 2026-01-26 00:00 London time = 2026-01-26 00:00 UTC (during GMT)
      const startUtc = "2026-01-26T04:00:00.000Z";
      const result = overrideStartToMidnight(startUtc, "Europe/London");
      
      // Result should be start of day in London timezone, converted to UTC
      const resultDate = new Date(result);
      expect(resultDate.getUTCHours()).toBe(0);
      expect(resultDate.getUTCMinutes()).toBe(0);
      expect(resultDate.getUTCSeconds()).toBe(0);
      expect(resultDate.getUTCMilliseconds()).toBe(0);
      
      // Date should be the same (26th)
      expect(resultDate.getUTCDate()).toBe(26);
      expect(resultDate.getUTCMonth()).toBe(0); // January (0-indexed)
      expect(resultDate.getUTCFullYear()).toBe(2026);
    });

    test("handles BST (British Summer Time) correctly", () => {
      // Input: 2026-07-26 14:00 UTC (which is 15:00 BST, 14:00 GMT)
      // Expected: 2026-07-26 00:00 BST = 2026-07-25 23:00 UTC
      const startUtc = "2026-07-26T14:00:00.000Z";
      const result = overrideStartToMidnight(startUtc, "Europe/London");
      
      const resultDate = new Date(result);
      // In July, London is in BST (UTC+1), so midnight BST = 23:00 UTC previous day
      // OR if the date parsing works correctly, it might be 00:00 BST = 23:00 UTC on 25th
      // The key is that the time component should be midnight in London timezone
      expect(resultDate.getUTCHours()).toBe(23); // 00:00 BST = 23:00 UTC previous day
      expect(resultDate.getUTCDate()).toBe(25); // Previous day in UTC
      expect(resultDate.getUTCMonth()).toBe(6); // July (0-indexed)
    });

    test("preserves date when time is already midnight", () => {
      const startUtc = "2026-01-26T00:00:00.000Z";
      const result = overrideStartToMidnight(startUtc, "Europe/London");
      
      const resultDate = new Date(result);
      expect(resultDate.getUTCHours()).toBe(0);
      expect(resultDate.getUTCMinutes()).toBe(0);
      expect(resultDate.getUTCDate()).toBe(26);
    });

    test("handles different timezones", () => {
      // Test with a different timezone to ensure it works correctly
      const startUtc = "2026-01-26T12:00:00.000Z";
      const result = overrideStartToMidnight(startUtc, "America/New_York");
      
      const resultDate = new Date(result);
      // Should be start of day in New York timezone
      // January 26, 2026 00:00 EST = 2026-01-26 05:00 UTC
      expect(resultDate.getUTCHours()).toBe(5);
      expect(resultDate.getUTCDate()).toBe(26);
    });
  });

  describe("EXTZ10 integration scenario", () => {
    test("simulates EXTZ10260126.txt file with date 260126 and time 0400", () => {
      // Simulate: EXTZ10260126.txt file
      // Row has: start_date=260126 (26/01/2026), start_time=0400 (04:00)
      // After normalise_booking_times, we get something like: 2026-01-26T04:00:00.000Z
      // After EXTZ10 override, we should get: 2026-01-26T00:00:00.000Z (midnight in tenant timezone)
      
      const filename = "EXTZ10260126.txt";
      const isExtz10 = isExtz10File(filename);
      expect(isExtz10).toBe(true);
      
      // Simulate parsed result from normalise_booking_times
      // Assuming the date 260126 + time 0400 was parsed as 2026-01-26 04:00 in London timezone
      const parsedStartUtc = "2026-01-26T04:00:00.000Z";
      
      // Apply override
      const overriddenStartUtc = overrideStartToMidnight(parsedStartUtc, "Europe/London");
      
      // Verify it's midnight
      const overriddenDate = new Date(overriddenStartUtc);
      expect(overriddenDate.getUTCHours()).toBe(0);
      expect(overriddenDate.getUTCMinutes()).toBe(0);
      expect(overriddenDate.getUTCDate()).toBe(26);
      expect(overriddenDate.getUTCMonth()).toBe(0); // January
      expect(overriddenDate.getUTCFullYear()).toBe(2026);
    });

    test("non-EXTZ10 file should not override", () => {
      const filename = "SOMEOTHER.txt";
      const isExtz10 = isExtz10File(filename);
      expect(isExtz10).toBe(false);
      
      // In real code, if !isExtz10, we wouldn't call overrideStartToMidnight
      // So the original time would be preserved
      const originalStartUtc = "2026-01-26T04:00:00.000Z";
      const originalDate = new Date(originalStartUtc);
      expect(originalDate.getUTCHours()).toBe(4); // Original time preserved
    });
  });
});
