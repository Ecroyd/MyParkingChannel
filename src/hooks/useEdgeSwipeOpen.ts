"use client";

import { useEffect } from "react";

type Options = {
  enabled: boolean;
  onOpen: () => void;
  /** Width of the left edge that starts a swipe (px). */
  edgeWidth?: number;
  /** Minimum horizontal travel to count as open (px). */
  minDistance?: number;
};

/**
 * Opens a left drawer when the user swipes right from the screen's left edge.
 * Ignores multi-touch and mostly-vertical gestures.
 */
export function useEdgeSwipeOpen({
  enabled,
  onOpen,
  edgeWidth = 28,
  minDistance = 48,
}: Options) {
  useEffect(() => {
    if (!enabled) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX > edgeWidth) return;
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 24) {
        tracking = false;
        return;
      }
      if (dx >= minDistance && Math.abs(dy) < 60) {
        tracking = false;
        onOpen();
      }
    };

    const onTouchEnd = () => {
      tracking = false;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, onOpen, edgeWidth, minDistance]);
}
