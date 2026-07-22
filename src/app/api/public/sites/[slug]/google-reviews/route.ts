import { NextRequest, NextResponse } from "next/server";
import { getSiteSeoBundleBySlug } from "@/lib/seo/load-site-seo";
import {
  parseGoogleReviewsConfig,
  normalizePlaceId,
} from "@/lib/seo/google-reviews-config";
import { fetchGooglePlaceReviews } from "@/lib/google/places-reviews";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public Google reviews proxy.
 * Tenant resolved from URL slug only — never trust client tenant_id.
 * Does not persist review content.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const ip = getClientIP(req);
  const limited = checkRateLimit(`google-reviews:${slug}:${ip}`, {
    windowMs: 60_000,
    maxRequests: 30,
  });
  if (!limited.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429 }
    );
  }

  const bundle = await getSiteSeoBundleBySlug(slug);
  if (!bundle?.settings) {
    return NextResponse.json({ success: false, error: "Site not found" }, { status: 404 });
  }

  // Ensure this slug's settings belong to the resolved tenant only
  const config = parseGoogleReviewsConfig(bundle.settings.presentation_json);
  if (!config.enabled || !config.sectionEnabled || !normalizePlaceId(config.placeId)) {
    return NextResponse.json({
      success: true,
      hidden: true,
      reason: "disabled_or_unconfigured",
    });
  }

  const result = await fetchGooglePlaceReviews({
    placeId: config.placeId,
    maxReviews: config.maxReviews,
    timeoutMs: 8000,
  });

  if (!result.ok) {
    return NextResponse.json({
      success: true,
      hidden: true,
      reason: "fetch_failed",
      // Do not leak detailed upstream errors to anonymous clients
      mapsUrl: config.mapsUrlOverride || null,
    });
  }

  if (!result.data.reviews.length) {
    return NextResponse.json({
      success: true,
      hidden: true,
      reason: "no_reviews",
      mapsUrl: config.mapsUrlOverride || result.data.googleMapsUri,
    });
  }

  return NextResponse.json({
    success: true,
    hidden: false,
    config: {
      heading: config.heading,
      intro: config.intro,
      showAggregateRating: config.showAggregateRating,
      showReviewCount: config.showReviewCount,
      showReviewerAvatar: config.showReviewerAvatar,
      showReviewDate: config.showReviewDate,
      maxReviews: config.maxReviews,
    },
    place: {
      displayName: result.data.displayName,
      rating: result.data.rating,
      userRatingCount: result.data.userRatingCount,
      googleMapsUri: config.mapsUrlOverride || result.data.googleMapsUri,
      attributions: result.data.attributions,
    },
    reviews: result.data.reviews.slice(0, config.maxReviews),
    relevanceNotice: result.data.relevanceNotice,
  });
}
