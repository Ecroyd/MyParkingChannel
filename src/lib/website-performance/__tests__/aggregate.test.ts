import { describe, expect, it } from "vitest";
import {
  buildFunnelSummary,
  resolvePresetRange,
  seasonalityWarning,
} from "../aggregate";

describe("buildFunnelSummary", () => {
  it("computes funnel counts, conversion and drop-off", () => {
    const rows = [
      { day: "2026-08-01", event_name: "website_session", attribution_channel: "all", event_count: 100, booking_value_cents_sum: 0 },
      { day: "2026-08-01", event_name: "availability_search", attribution_channel: "all", event_count: 50, booking_value_cents_sum: 0 },
      { day: "2026-08-01", event_name: "booking_started", attribution_channel: "all", event_count: 20, booking_value_cents_sum: 0 },
      { day: "2026-08-01", event_name: "checkout_started", attribution_channel: "all", event_count: 10, booking_value_cents_sum: 0 },
      { day: "2026-08-01", event_name: "booking_completed", attribution_channel: "all", event_count: 5, booking_value_cents_sum: 25000 },
    ];

    const summary = buildFunnelSummary(rows);
    expect(summary.stages[0].count).toBe(100);
    expect(summary.stages[1].count).toBe(50);
    expect(summary.stages[4].count).toBe(5);
    expect(summary.visitorToBookingPct).toBe(5);
    expect(summary.searchToBookingPct).toBe(10);
    expect(summary.checkoutToBookingPct).toBe(50);
    expect(summary.bookingRevenueCents).toBe(25000);
    expect(summary.averageBookingValueCents).toBe(5000);
    expect(summary.stages[0].conversionToNextPct).toBe(50);
    expect(summary.stages[0].dropOffToNextPct).toBe(50);
  });

  it("distinguishes failed vs completed via event names", () => {
    const rows = [
      { day: "2026-08-01", event_name: "website_session", attribution_channel: "all", event_count: 10, booking_value_cents_sum: 0 },
      { day: "2026-08-01", event_name: "booking_failed", attribution_channel: "all", event_count: 3, booking_value_cents_sum: 0 },
      { day: "2026-08-01", event_name: "booking_completed", attribution_channel: "all", event_count: 2, booking_value_cents_sum: 8000 },
      { day: "2026-08-01", event_name: "availability_search", attribution_channel: "all", event_count: 0, booking_value_cents_sum: 0 },
      { day: "2026-08-01", event_name: "booking_started", attribution_channel: "all", event_count: 0, booking_value_cents_sum: 0 },
      { day: "2026-08-01", event_name: "checkout_started", attribution_channel: "all", event_count: 0, booking_value_cents_sum: 0 },
    ];
    const summary = buildFunnelSummary(rows);
    expect(summary.completedBookings).toBe(2);
    expect(summary.stages.find((s) => s.eventName === "booking_completed")?.count).toBe(2);
  });
});

describe("resolvePresetRange", () => {
  it("supports today / 7 / 30 / 90 / custom", () => {
    const today = "2026-08-11";
    expect(resolvePresetRange("today", undefined, undefined, today)).toEqual({
      from: "2026-08-11",
      to: "2026-08-11",
    });
    expect(resolvePresetRange("7d", undefined, undefined, today)).toEqual({
      from: "2026-08-05",
      to: "2026-08-11",
    });
    expect(resolvePresetRange("30d", undefined, undefined, today).from).toBe("2026-07-13");
    expect(resolvePresetRange("90d", undefined, undefined, today).from).toBe("2026-05-14");
    expect(
      resolvePresetRange("custom", "2026-01-01", "2026-01-31", today)
    ).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });
});

describe("seasonalityWarning / migration periods", () => {
  it("warns when months differ", () => {
    const warning = seasonalityWarning(
      { from: "2026-06-01", to: "2026-06-30" },
      { from: "2026-07-01", to: "2026-07-30" }
    );
    expect(warning).toMatch(/Seasonality warning/i);
  });

  it("like-for-like day counts match for adjacent windows", () => {
    // migrationDate = 2026-08-01, 30 days → before 07-02..07-31, after 08-01..08-30
    const before = { from: "2026-07-02", to: "2026-07-31" };
    const after = { from: "2026-08-01", to: "2026-08-30" };
    const beforeDays =
      (Date.parse(`${before.to}T00:00:00Z`) - Date.parse(`${before.from}T00:00:00Z`)) /
        86400000 +
      1;
    const afterDays =
      (Date.parse(`${after.to}T00:00:00Z`) - Date.parse(`${after.from}T00:00:00Z`)) /
        86400000 +
      1;
    expect(beforeDays).toBe(30);
    expect(afterDays).toBe(30);
  });
});
