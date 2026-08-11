import type { CookieConsentMode } from "@/lib/seo/types";

/**
 * First-party conversion analytics policy:
 * - off: allow first-party (no third-party tags implied)
 * - basic: allow first-party operational funnel
 * - strict: require explicit consent flag before client beacons
 *
 * Server-authoritative booking_completed / booking_failed / checkout_started
 * are operational records and may still be written without a browser consent
 * cookie (no advertising identifiers).
 */
export function allowFirstPartyClientAnalytics(
  mode: CookieConsentMode | string | null | undefined,
  hasConsent: boolean
): boolean {
  const m = (mode || "basic").toLowerCase();
  if (m === "strict") return hasConsent;
  return true;
}

/** Whether third-party tags (GA4/GTM/Clarity) may load. */
export function allowThirdPartyTags(
  mode: CookieConsentMode | string | null | undefined,
  hasConsent: boolean
): boolean {
  const m = (mode || "basic").toLowerCase();
  if (m === "off") return false;
  if (m === "strict") return hasConsent;
  // basic: load tags (matches prior behaviour for configured IDs)
  return true;
}

export const CONSENT_COOKIE_NAME = "pc_cookie_consent";
export const CONSENT_STORAGE_KEY = "pc_cookie_consent";
