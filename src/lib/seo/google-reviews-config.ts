/**
 * Per-tenant Google Reviews display configuration.
 * Stored in site_seo_settings.presentation_json.googleReviews.
 * Never stores review text, ratings, or avatars from Google.
 */

export type GoogleReviewsConfig = {
  enabled: boolean;
  placeId: string;
  maxReviews: 1 | 2 | 3;
  heading: string;
  intro: string;
  showAggregateRating: boolean;
  showReviewCount: boolean;
  showReviewerAvatar: boolean;
  showReviewDate: boolean;
  /** When false, homepage omits the Google reviews section entirely. */
  sectionEnabled: boolean;
  /** Optional override; prefer googleMapsUri from Places API. */
  mapsUrlOverride: string | null;
  lastConnectionStatus: "ok" | "error" | "untested";
  lastConnectionError: string | null;
  lastCheckedAt: string | null;
};

export const DEFAULT_GOOGLE_REVIEWS_CONFIG: GoogleReviewsConfig = {
  enabled: false,
  placeId: "",
  maxReviews: 3,
  heading: "What guests say on Google",
  intro: "",
  showAggregateRating: true,
  showReviewCount: true,
  showReviewerAvatar: true,
  showReviewDate: true,
  sectionEnabled: true,
  mapsUrlOverride: null,
  lastConnectionStatus: "untested",
  lastConnectionError: null,
  lastCheckedAt: null,
};

export function parseGoogleReviewsConfig(presentation: unknown): GoogleReviewsConfig {
  const root =
    presentation && typeof presentation === "object" && !Array.isArray(presentation)
      ? (presentation as Record<string, unknown>)
      : {};
  const raw =
    root.googleReviews && typeof root.googleReviews === "object" && !Array.isArray(root.googleReviews)
      ? (root.googleReviews as Record<string, unknown>)
      : {};

  const maxRaw = Number(raw.maxReviews ?? 3);
  const maxReviews = (maxRaw === 1 || maxRaw === 2 || maxRaw === 3 ? maxRaw : 3) as 1 | 2 | 3;

  const status = raw.lastConnectionStatus;
  const lastConnectionStatus =
    status === "ok" || status === "error" || status === "untested" ? status : "untested";

  return {
    enabled: Boolean(raw.enabled),
    placeId: typeof raw.placeId === "string" ? raw.placeId.trim() : "",
    maxReviews,
    heading:
      typeof raw.heading === "string" && raw.heading.trim()
        ? raw.heading.trim()
        : DEFAULT_GOOGLE_REVIEWS_CONFIG.heading,
    intro: typeof raw.intro === "string" ? raw.intro.trim() : "",
    showAggregateRating: raw.showAggregateRating !== false,
    showReviewCount: raw.showReviewCount !== false,
    showReviewerAvatar: raw.showReviewerAvatar !== false,
    showReviewDate: raw.showReviewDate !== false,
    sectionEnabled: raw.sectionEnabled !== false,
    mapsUrlOverride:
      typeof raw.mapsUrlOverride === "string" && raw.mapsUrlOverride.trim()
        ? raw.mapsUrlOverride.trim()
        : null,
    lastConnectionStatus,
    lastConnectionError:
      typeof raw.lastConnectionError === "string" ? raw.lastConnectionError : null,
    lastCheckedAt: typeof raw.lastCheckedAt === "string" ? raw.lastCheckedAt : null,
  };
}

export function mergeGoogleReviewsIntoPresentation(
  presentation: unknown,
  googleReviews: GoogleReviewsConfig
): Record<string, unknown> {
  const root =
    presentation && typeof presentation === "object" && !Array.isArray(presentation)
      ? { ...(presentation as Record<string, unknown>) }
      : {};
  root.googleReviews = { ...googleReviews };
  return root;
}

export function normalizePlaceId(placeId: string): string {
  const trimmed = placeId.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("places/") ? trimmed.slice("places/".length) : trimmed;
}
