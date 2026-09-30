import type { AttributionChannel } from "./events";

export type AttributionInput = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
  landingPage?: string | null;
};

/**
 * Classify traffic when signals exist. Returns null when attribution cannot
 * be determined — callers must not invent a channel.
 */
export function classifyAttribution(input: AttributionInput): AttributionChannel | null {
  const source = (input.utmSource || "").trim().toLowerCase();
  const medium = (input.utmMedium || "").trim().toLowerCase();
  const referrer = (input.referrer || "").trim().toLowerCase();

  if (source || medium) {
    if (
      medium === "cpc" ||
      medium === "ppc" ||
      medium === "paid" ||
      medium === "paidsearch" ||
      medium === "display" ||
      medium === "cpm" ||
      medium.includes("paid")
    ) {
      return "paid";
    }
    if (
      medium === "social" ||
      medium === "social-paid" ||
      ["facebook", "instagram", "twitter", "x", "linkedin", "tiktok", "pinterest"].includes(
        source
      )
    ) {
      return "social";
    }
    if (medium === "organic" || medium === "seo") {
      return "organic";
    }
    if (medium === "referral") {
      return "referral";
    }
    if (medium === "email" || medium === "affiliate") {
      return "referral";
    }
    // UTM present but unknown shape — mark unknown rather than guessing.
    return "unknown";
  }

  if (!referrer) {
    // No referrer and no UTM — could be direct, but privacy tools strip referrers.
    // Only claim direct when we have an explicit empty referrer on a top-level landing.
    if (input.landingPage) return "direct";
    return null;
  }

  try {
    const host = new URL(referrer.startsWith("http") ? referrer : `https://${referrer}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();

    const searchHosts = [
      "google.",
      "bing.",
      "yahoo.",
      "duckduckgo.",
      "baidu.",
      "yandex.",
      "ecosia.",
    ];
    if (searchHosts.some((h) => host.includes(h.replace(/\.$/, "")) || host.startsWith(h) || host.includes(h))) {
      return "organic";
    }

    const socialHosts = [
      "facebook.com",
      "fb.com",
      "instagram.com",
      "t.co",
      "twitter.com",
      "x.com",
      "linkedin.com",
      "tiktok.com",
      "pinterest.com",
      "reddit.com",
    ];
    if (socialHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      return "social";
    }

    return "referral";
  } catch {
    return null;
  }
}

export function detectDeviceClass(userAgent: string | null | undefined): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(ua)) return "mobile";
  if (/mozilla|chrome|safari|firefox|edg|opera/.test(ua)) return "desktop";
  return "unknown";
}
