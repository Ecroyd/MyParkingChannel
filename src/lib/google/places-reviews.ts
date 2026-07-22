import "server-only";

import { createAdminClient } from "@/lib/supabase/server-admin";
import { normalizePlaceId } from "@/lib/seo/google-reviews-config";

const PLACES_BASE = "https://places.googleapis.com/v1";
const FIELD_MASK =
  "id,displayName,rating,userRatingCount,reviews,googleMapsUri,attributions";

export type GooglePlaceReview = {
  name: string;
  relativePublishTimeDescription: string | null;
  rating: number | null;
  text: string;
  authorName: string;
  authorUri: string | null;
  authorPhotoUri: string | null;
  publishTime: string | null;
};

export type GooglePlaceReviewsPayload = {
  placeId: string;
  displayName: string | null;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
  attributions: string[];
  reviews: GooglePlaceReview[];
  relevanceNotice: "Google reviews shown by relevance";
};

function encryptSecret(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function decryptSecret(ciphertext: string): string {
  try {
    return Buffer.from(ciphertext, "base64").toString("utf8");
  } catch {
    return ciphertext;
  }
}

/** Strip tags / control chars; React still escapes on render. */
export function sanitizeReviewText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

export async function getGooglePlacesApiKey(): Promise<string | null> {
  const envKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (envKey) return envKey;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_integration_settings")
    .select("api_key_encrypted, is_enabled")
    .eq("integration_key", "google_places")
    .maybeSingle();

  if (error || !data?.is_enabled || !data.api_key_encrypted) {
    return null;
  }
  const key = decryptSecret(data.api_key_encrypted).trim();
  return key || null;
}

export async function saveGooglePlacesApiKey(args: {
  apiKey?: string | null;
  isEnabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("platform_integration_settings")
    .select("api_key_encrypted")
    .eq("integration_key", "google_places")
    .maybeSingle();

  let api_key_encrypted = existing?.api_key_encrypted ?? null;
  if (args.apiKey && args.apiKey.trim()) {
    api_key_encrypted = encryptSecret(args.apiKey.trim());
  }
  if (!api_key_encrypted && args.isEnabled) {
    return { ok: false, error: "API key required to enable Google Places" };
  }

  const { error } = await admin.from("platform_integration_settings").upsert(
    {
      integration_key: "google_places",
      api_key_encrypted,
      is_enabled: args.isEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "integration_key" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function getGooglePlacesPlatformStatus(): Promise<{
  configured: boolean;
  isEnabled: boolean;
  hasEnvFallback: boolean;
}> {
  const hasEnvFallback = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_integration_settings")
    .select("api_key_encrypted, is_enabled")
    .eq("integration_key", "google_places")
    .maybeSingle();

  return {
    configured: Boolean(data?.api_key_encrypted) || hasEnvFallback,
    isEnabled: Boolean(data?.is_enabled) || hasEnvFallback,
    hasEnvFallback,
  };
}

type PlacesApiReview = {
  name?: string;
  relativePublishTimeDescription?: string;
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: {
    displayName?: string;
    uri?: string;
    photoUri?: string;
  };
  publishTime?: string;
};

type PlacesApiResponse = {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  attributions?: Array<{ provider?: string; providerUri?: string } | string>;
  reviews?: PlacesApiReview[];
  error?: { message?: string; status?: string };
};

export async function fetchGooglePlaceReviews(args: {
  placeId: string;
  maxReviews: number;
  timeoutMs?: number;
}): Promise<
  | { ok: true; data: GooglePlaceReviewsPayload }
  | { ok: false; error: string; status?: number }
> {
  const placeId = normalizePlaceId(args.placeId);
  if (!placeId) {
    return { ok: false, error: "Google Place ID is required" };
  }

  const apiKey = await getGooglePlacesApiKey();
  if (!apiKey) {
    return { ok: false, error: "Google Places API key is not configured" };
  }

  const max = Math.min(3, Math.max(1, Math.floor(args.maxReviews || 3)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs ?? 8000);

  try {
    const url = `${PLACES_BASE}/places/${encodeURIComponent(placeId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const json = (await res.json()) as PlacesApiResponse;
    if (!res.ok) {
      const msg =
        json?.error?.message ||
        `Google Places request failed (${res.status})`;
      return { ok: false, error: msg, status: res.status };
    }

    const reviews: GooglePlaceReview[] = [];
    for (const r of json.reviews ?? []) {
      if (reviews.length >= max) break;
      const text = sanitizeReviewText(r.text?.text || r.originalText?.text || "");
      const authorName = sanitizeReviewText(r.authorAttribution?.displayName || "");
      if (!text || !authorName) continue;
      reviews.push({
        name: sanitizeReviewText(r.name || ""),
        relativePublishTimeDescription: r.relativePublishTimeDescription
          ? sanitizeReviewText(r.relativePublishTimeDescription)
          : null,
        rating: typeof r.rating === "number" ? r.rating : null,
        text,
        authorName,
        authorUri: r.authorAttribution?.uri
          ? sanitizeReviewText(r.authorAttribution.uri)
          : null,
        authorPhotoUri: r.authorAttribution?.photoUri
          ? sanitizeReviewText(r.authorAttribution.photoUri)
          : null,
        publishTime: r.publishTime || null,
      });
    }

    const attributions: string[] = [];
    if (Array.isArray(json.attributions)) {
      for (const a of json.attributions) {
        if (typeof a === "string" && a.trim()) attributions.push(sanitizeReviewText(a));
        else if (a && typeof a === "object" && a.provider) {
          attributions.push(sanitizeReviewText(String(a.provider)));
        }
      }
    }

    return {
      ok: true,
      data: {
        placeId,
        displayName: json.displayName?.text
          ? sanitizeReviewText(json.displayName.text)
          : null,
        rating: typeof json.rating === "number" ? json.rating : null,
        userRatingCount:
          typeof json.userRatingCount === "number" ? json.userRatingCount : null,
        googleMapsUri: json.googleMapsUri
          ? sanitizeReviewText(json.googleMapsUri)
          : null,
        attributions,
        reviews,
        relevanceNotice: "Google reviews shown by relevance",
      },
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Google Places request timed out"
        : err instanceof Error
          ? err.message
          : "Google Places request failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
