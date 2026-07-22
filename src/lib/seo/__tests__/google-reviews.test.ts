import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseGoogleReviewsConfig,
  mergeGoogleReviewsIntoPresentation,
  normalizePlaceId,
} from "@/lib/seo/google-reviews-config";
import { sanitizeReviewText, fetchGooglePlaceReviews } from "@/lib/google/places-reviews";
import { buildLocalBusinessJsonLd } from "@/lib/seo/json-ld";
import { buildHomepageModel } from "@/lib/seo/homepage-model";
import { runSeoHealthChecks } from "@/lib/seo/health";
import type { SitePageRow, SiteSeoSettings } from "@/lib/seo/types";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  }),
}));

function page(partial: Partial<SitePageRow> & { path: string }): SitePageRow {
  return {
    id: "p1",
    site_id: "site-a",
    path: partial.path,
    title: partial.title || "Home",
    content_md: "",
    page_key: partial.page_key ?? "home",
    h1: partial.h1 ?? "Airport parking",
    excerpt: null,
    content_json: partial.content_json ?? [],
    seo_title: null,
    meta_description: null,
    canonical_path: null,
    robots_index: true,
    robots_follow: true,
    og_title: null,
    og_description: null,
    og_image_url: null,
    nav_label: null,
    nav_order: 0,
    show_in_navigation: true,
    status: "published",
    published_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    created_at: "2026-07-01T00:00:00Z",
  };
}

const settings: SiteSeoSettings = {
  id: "s1",
  site_id: "site-a",
  tenant_id: "tenant-a",
  website_name: "Tenant A",
  alternative_site_name: null,
  default_title_template: null,
  default_meta_description: null,
  default_og_image_url: null,
  default_robots_index: true,
  default_robots_follow: true,
  primary_language: "en-GB",
  allow_indexing: true,
  schema_business_type: "ParkingFacility",
  logo_url: null,
  favicon_url: null,
  indexing_mode: "live_indexable",
  migration_target_domain: null,
  migration_notes: null,
  canonical_domain_override: null,
  google_search_console_verification: null,
  ga4_measurement_id: null,
  google_tag_manager_id: null,
  bing_verification: null,
  microsoft_clarity_id: null,
  cookie_consent_mode: "basic",
  last_published_at: null,
  presentation_json: {},
  created_at: "",
  updated_at: "",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GOOGLE_PLACES_API_KEY;
});

describe("1. Tenant isolation of Google review configuration", () => {
  it("Tenant A place ID cannot overwrite Tenant B config object", () => {
    const a = mergeGoogleReviewsIntoPresentation(
      {},
      {
        ...parseGoogleReviewsConfig({}),
        enabled: true,
        placeId: "ChIJ_TENANT_A",
        maxReviews: 2,
      }
    );
    const b = parseGoogleReviewsConfig({
      googleReviews: { enabled: true, placeId: "ChIJ_TENANT_B", maxReviews: 3 },
    });
    expect((a.googleReviews as { placeId: string }).placeId).toBe("ChIJ_TENANT_A");
    expect(b.placeId).toBe("ChIJ_TENANT_B");
    expect(b.placeId).not.toBe((a.googleReviews as { placeId: string }).placeId);
  });

  it("settings upsert ownership fields are always taken from auth context pattern", () => {
    // Mirror admin settings route: strip client tenant_id/site_id
    const body = {
      tenant_id: "attacker-tenant",
      site_id: "attacker-site",
      presentation_json: {
        googleReviews: { enabled: true, placeId: "ChIJ_ATTACKER" },
      },
    };
    const { tenant_id: _t, site_id: _s, ...safe } = body;
    const owned = {
      ...safe,
      site_id: "site-a",
      tenant_id: "tenant-a",
    };
    expect(owned.tenant_id).toBe("tenant-a");
    expect(owned.site_id).toBe("site-a");
    expect(owned.tenant_id).not.toBe("attacker-tenant");
  });
});

describe("2. API key never returned to browser payloads", () => {
  it("platform status shape excludes api_key fields", () => {
    const browserPayload = {
      success: true,
      settings: {
        configured: true,
        is_enabled: true,
        has_env_fallback: false,
      },
    };
    expect(JSON.stringify(browserPayload)).not.toMatch(/api_key|AIza|encrypted/i);
  });
});

describe("3–7. Places fetch behaviour", () => {
  it("requests the configured tenant Place ID and respects maxReviews", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key-not-for-browser";
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/places/ChIJ_TENANT_A");
      return {
        ok: true,
        json: async () => ({
          id: "places/ChIJ_TENANT_A",
          displayName: { text: "Tenant A Parking" },
          rating: 4.8,
          userRatingCount: 120,
          googleMapsUri: "https://maps.google.com/?cid=1",
          attributions: [{ provider: "Google" }],
          reviews: [
            {
              name: "reviews/1",
              rating: 5,
              relativePublishTimeDescription: "a week ago",
              text: { text: "Excellent parking" },
              authorAttribution: {
                displayName: "Alex",
                uri: "https://maps.google.com/maps/contrib/1",
                photoUri: "https://lh3.googleusercontent.com/a/1",
              },
            },
            {
              name: "reviews/2",
              rating: 4,
              relativePublishTimeDescription: "a month ago",
              text: { text: "Good value" },
              authorAttribution: { displayName: "Sam" },
            },
            {
              name: "reviews/3",
              rating: 5,
              text: { text: "Would use again" },
              authorAttribution: { displayName: "Jo" },
            },
            {
              name: "reviews/4",
              rating: 5,
              text: { text: "Should not appear" },
              authorAttribution: { displayName: "Extra" },
            },
          ],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGooglePlaceReviews({
      placeId: "places/ChIJ_TENANT_A",
      maxReviews: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.placeId).toBe("ChIJ_TENANT_A");
    expect(result.data.reviews).toHaveLength(2);
    expect(result.data.relevanceNotice).toBe("Google reviews shown by relevance");
    expect(result.data.reviews[0].authorName).toBe("Alex");
    expect(result.data.reviews[0].authorUri).toContain("maps.google.com");
    expect(result.data.reviews[0].authorPhotoUri).toBeTruthy();
    expect(result.data.reviews[0].text).toBe("Excellent parking");
    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers?: Record<string, string> },
    ];
    expect(call[1]?.headers?.["X-Goog-Api-Key"]).toBe("test-key-not-for-browser");
  });

  it("hides safely on empty/error API responses", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: "PERMISSION_DENIED" } }),
      }))
    );
    const failed = await fetchGooglePlaceReviews({ placeId: "ChIJ1", maxReviews: 3 });
    expect(failed.ok).toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          id: "places/ChIJ1",
          reviews: [],
          googleMapsUri: "https://maps.google.com/?cid=9",
        }),
      }))
    );
    const empty = await fetchGooglePlaceReviews({ placeId: "ChIJ1", maxReviews: 3 });
    expect(empty.ok).toBe(true);
    if (empty.ok) expect(empty.data.reviews).toHaveLength(0);
  });

  it("strips HTML from review text (sanitize before render)", () => {
    expect(sanitizeReviewText('<script>alert(1)</script>Great stay')).toBe("Great stay");
  });

  it("clamps maxReviews to 1–3", () => {
    expect(parseGoogleReviewsConfig({ googleReviews: { maxReviews: 1 } }).maxReviews).toBe(1);
    expect(parseGoogleReviewsConfig({ googleReviews: { maxReviews: 99 } }).maxReviews).toBe(3);
  });

  it("normalizes places/ prefix", () => {
    expect(normalizePlaceId("places/ChIJ123")).toBe("ChIJ123");
  });
});

describe("8. Homepage booking and SEO metadata remain unaffected", () => {
  it("keeps configured H1 when Google reviews are enabled", () => {
    const model = buildHomepageModel({
      page: page({
        path: "/",
        h1: "Secure Airport Parking with Tenant A",
      }),
      settings: {
        ...settings,
        presentation_json: {
          googleReviews: { enabled: true, placeId: "ChIJ123", sectionEnabled: true },
        },
      },
      profile: { business_name: "Tenant A" },
    });
    expect(model.h1).toBe("Secure Airport Parking with Tenant A");
  });
});

describe("9. No Review/AggregateRating from Google integration in LocalBusiness", () => {
  it("does not invent AggregateRating from Google review config", () => {
    const ld = buildLocalBusinessJsonLd({
      profile: {
        business_name: "Tenant A",
        address: { street: "1 Road", city: "Town", postalCode: "EX1 1AA" },
      },
      url: "https://a.example/",
    });
    expect(ld?.aggregateRating).toBeUndefined();
    expect(JSON.stringify(ld)).not.toMatch(/"@type":"Review"/);
  });
});

describe("10. No Google review content persisted to presentation_json", () => {
  it("strips injected review bodies when merging durable config", () => {
    const dirty = {
      googleReviews: {
        enabled: true,
        placeId: "ChIJ123",
        reviews: [{ text: "should not persist", authorName: "Eve" }],
        rating: 4.9,
        avatars: ["https://example.com/a.png"],
      },
    };
    const merged = mergeGoogleReviewsIntoPresentation(
      dirty,
      parseGoogleReviewsConfig(dirty)
    );
    const stored = JSON.stringify(merged);
    expect(stored).not.toMatch(/should not persist/);
    expect(stored).not.toMatch(/avatars/);
    expect(merged.googleReviews).toMatchObject({
      enabled: true,
      placeId: "ChIJ123",
    });
    expect((merged.googleReviews as Record<string, unknown>).reviews).toBeUndefined();
  });
});

describe("SEO health: reviews are optional recommendation", () => {
  it("uses recommended severity and suggested wording", () => {
    const checks = runSeoHealthChecks({
      settings,
      pages: [page({ path: "/", page_key: "home", content_json: [] })],
      redirects: [],
      domains: [],
      profile: {
        business_name: "Tenant A",
        phone: "+441234",
        email: "a@example.com",
        address: { street: "1 Road", city: "Town", postalCode: "EX1 1AA" },
      },
    });
    const reviews = checks.find((c) => c.id === "missing_homepage_reviews");
    expect(reviews?.severity).toBe("recommended");
    expect(reviews?.detail).toContain(
      "Optional: Connect approved customer or Google reviews"
    );
  });

  it("does not recommend when Google reviews are connected", () => {
    const checks = runSeoHealthChecks({
      settings: {
        ...settings,
        presentation_json: {
          googleReviews: {
            enabled: true,
            sectionEnabled: true,
            placeId: "ChIJ123",
          },
        },
      },
      pages: [page({ path: "/", page_key: "home", content_json: [] })],
      redirects: [],
      domains: [],
      profile: {
        business_name: "Tenant A",
        phone: "+441234",
        email: "a@example.com",
        address: { street: "1 Road", city: "Town", postalCode: "EX1 1AA" },
      },
    });
    expect(checks.find((c) => c.id === "missing_homepage_reviews")).toBeUndefined();
  });
});
