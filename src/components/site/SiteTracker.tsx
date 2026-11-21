"use client";

// Counts visits to a tenant site for Admin > Visitors: a page view on every navigation (the first
// one says where the visit came from) and a ping every minute while the tab is open and visible,
// so the admin can see who is on the site right now. Cookieless; see src/lib/visitors.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isEntryPageLoad, trackSiteEvent } from "@/lib/visitors/client";

const PING_MS = 60_000;

export function SiteTracker({ slug }: { slug: string }) {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    const entry = first.current && isEntryPageLoad();
    trackSiteEvent("pageview", {
      slug,
      entry,
      ...(first.current ? { url: window.location.href, referrer: document.referrer || null } : {}),
    });
    first.current = false;
  }, [pathname, slug]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") trackSiteEvent("ping", { slug });
    }, PING_MS);
    return () => window.clearInterval(id);
  }, [slug]);

  return null;
}
