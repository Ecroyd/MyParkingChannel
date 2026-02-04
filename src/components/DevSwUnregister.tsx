'use client';

import { useEffect } from 'react';

/**
 * In development, unregister any service worker that may have been registered
 * by a production build (e.g. when visiting the live site). Stale SW precache
 * causes 404s for Next.js dev chunks like app-pages-internals.js and breaks login.
 * Runs only in development; no-op in production.
 */
export default function DevSwUnregister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    (async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      if (cancelled || regs.length === 0) return;
      for (const reg of regs) await reg.unregister();
      if (!cancelled) window.location.reload();
    })();
    return () => { cancelled = true; };
  }, []);

  return null;
}
