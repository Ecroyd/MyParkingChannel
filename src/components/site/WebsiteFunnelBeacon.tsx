"use client";

import { useEffect } from "react";
import { trackWebsiteSession } from "@/lib/website-performance/clientTracker";

/**
 * Lightweight session beacon for public tenant sites.
 * Does not block rendering; analytics failures are swallowed.
 */
export function WebsiteFunnelBeacon({
  tenantSlug,
  cookieConsentMode,
}: {
  tenantSlug: string;
  cookieConsentMode?: string | null;
}) {
  useEffect(() => {
    trackWebsiteSession(tenantSlug, cookieConsentMode);
  }, [tenantSlug, cookieConsentMode]);

  return null;
}
