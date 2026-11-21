// Browser side of visitor tracking: sends small beacons to /api/public/track. No cookies or storage.

type TrackEvent = 'pageview' | 'checkout' | 'ping';

export function trackSiteEvent(event: TrackEvent, extra: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  try {
    if (new URLSearchParams(window.location.search).get('preview') === '1') return;
    const body = JSON.stringify({ event, path: window.location.pathname, ...extra });
    const sent =
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon('/api/public/track', new Blob([body], { type: 'application/json' }));
    if (!sent) {
      void fetch('/api/public/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* tracking must never break the page */
  }
}

/** True when this page load is the start of a visit: arrived from another site or typed in, not a reload. */
export function isEntryPageLoad(): boolean {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && (nav.type === 'reload' || nav.type === 'back_forward')) return false;
    if (!document.referrer) return true;
    return new URL(document.referrer).host !== window.location.host;
  } catch {
    return true;
  }
}
