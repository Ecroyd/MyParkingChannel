import { describe, expect, it } from "vitest";

/**
 * Pure threshold logic mirrored from useEdgeSwipeOpen — keeps the gesture
 * contract covered without mounting React in jsdom.
 */
function shouldOpenFromSwipe(opts: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  edgeWidth?: number;
  minDistance?: number;
}): boolean {
  const edgeWidth = opts.edgeWidth ?? 28;
  const minDistance = opts.minDistance ?? 48;
  if (opts.startX > edgeWidth) return false;
  const dx = opts.endX - opts.startX;
  const dy = opts.endY - opts.startY;
  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 24) return false;
  return dx >= minDistance && Math.abs(dy) < 60;
}

describe("edge swipe open thresholds", () => {
  it("opens on a clear right swipe from the left edge", () => {
    expect(
      shouldOpenFromSwipe({ startX: 8, startY: 200, endX: 80, endY: 205 })
    ).toBe(true);
  });

  it("ignores swipes that start away from the edge", () => {
    expect(
      shouldOpenFromSwipe({ startX: 80, startY: 200, endX: 160, endY: 205 })
    ).toBe(false);
  });

  it("ignores mostly vertical gestures", () => {
    expect(
      shouldOpenFromSwipe({ startX: 8, startY: 200, endX: 20, endY: 320 })
    ).toBe(false);
  });
});
