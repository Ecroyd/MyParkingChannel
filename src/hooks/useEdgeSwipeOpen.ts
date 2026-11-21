"use client";

import { useEffect, useRef } from "react";

type Options = {
  enabled: boolean;
  onOpen: () => void;
  /** Width of the left edge that starts a swipe (px). */
  edgeWidth?: number;
  /** Minimum horizontal travel to count as open (px). */
  minDistance?: number;
  /** Only claim edge swipes below this viewport width (px), where the drawer exists. */
  maxViewportWidth?: number;
};

const INTERACTIVE = "a, button, input, select, textarea, label, [role='button'], [contenteditable='true']";

/**
 * Opens a left drawer when the user swipes right from the screen's left edge.
 * Ignores multi-touch and mostly-vertical gestures.
 *
 * The touchstart listener is non-passive so it can preventDefault on edge
 * touches: that stops iOS Safari / standalone PWAs from treating the swipe as
 * "go back". Touches that start on an interactive element are left alone so
 * taps on controls near the edge still click.
 */
export function useEdgeSwipeOpen({
  enabled,
  onOpen,
  edgeWidth = 28,
  minDistance = 48,
  maxViewportWidth = 768,
}: Options) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (window.innerWidth >= maxViewportWidth) return;
      const t = e.touches[0];
      if (t.clientX > edgeWidth) return;
      const target = e.target as Element | null;
      if (target?.closest?.(INTERACTIVE)) return;

      // Claim the gesture so the browser doesn't navigate back.
      if (e.cancelable) e.preventDefault();
      tracking = enabled;
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
        onOpenRef.current();
      }
    };

    const onTouchEnd = () => {
      tracking = false;
    };

    document.addEventListener("touchstart", onTouchStart, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, edgeWidth, minDistance, maxViewportWidth]);
}
