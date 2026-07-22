import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import {
  parseGoogleReviewsConfig,
  mergeGoogleReviewsIntoPresentation,
  normalizePlaceId,
  type GoogleReviewsConfig,
} from "@/lib/seo/google-reviews-config";
import { fetchGooglePlaceReviews } from "@/lib/google/places-reviews";
import { invalidateSiteSeoCaches } from "@/lib/seo/cache";

export async function POST(req: Request) {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;

  const body = await req.json().catch(() => ({}));
  // Never accept tenant_id / site_id from client for ownership
  const placeId = normalizePlaceId(String(body.placeId ?? ""));
  const maxReviews = Number(body.maxReviews ?? 3);

  if (!placeId) {
    return NextResponse.json({ error: "Google Place ID is required" }, { status: 400 });
  }

  const result = await fetchGooglePlaceReviews({
    placeId,
    maxReviews: maxReviews === 1 || maxReviews === 2 ? maxReviews : 3,
    timeoutMs: 10000,
  });

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("site_seo_settings")
    .select("presentation_json")
    .eq("site_id", ctx.siteId)
    .maybeSingle();

  const current = parseGoogleReviewsConfig(settings?.presentation_json);
  const next: GoogleReviewsConfig = {
    ...current,
    placeId,
    lastCheckedAt: new Date().toISOString(),
    lastConnectionStatus: result.ok ? "ok" : "error",
    lastConnectionError: result.ok ? null : result.error,
    mapsUrlOverride:
      current.mapsUrlOverride ||
      (result.ok ? result.data.googleMapsUri : current.mapsUrlOverride),
  };

  const presentation_json = mergeGoogleReviewsIntoPresentation(
    settings?.presentation_json,
    next
  );

  await admin
    .from("site_seo_settings")
    .update({
      presentation_json,
      updated_at: new Date().toISOString(),
    })
    .eq("site_id", ctx.siteId)
    .eq("tenant_id", ctx.tenantId);

  const { data: domains } = await admin
    .from("tenant_domains")
    .select("domain")
    .eq("tenant_id", ctx.tenantId);

  invalidateSiteSeoCaches({
    siteId: ctx.siteId,
    tenantId: ctx.tenantId,
    hostnames: (domains ?? []).map((d) => d.domain),
  });

  if (!result.ok) {
    return NextResponse.json({
      success: false,
      error: result.error,
      connection: {
        status: next.lastConnectionStatus,
        lastCheckedAt: next.lastCheckedAt,
        lastConnectionError: next.lastConnectionError,
      },
    });
  }

  return NextResponse.json({
    success: true,
    connection: {
      status: "ok",
      lastCheckedAt: next.lastCheckedAt,
      lastConnectionError: null,
    },
    preview: {
      displayName: result.data.displayName,
      rating: result.data.rating,
      userRatingCount: result.data.userRatingCount,
      googleMapsUri: result.data.googleMapsUri,
      reviewCountReturned: result.data.reviews.length,
      // Sample author names only for admin preview — not persisted as review content
      sampleAuthors: result.data.reviews.map((r) => r.authorName),
    },
  });
}
