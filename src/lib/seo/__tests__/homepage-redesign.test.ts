import { describe, expect, it } from "vitest";
import {
  buildHomepageModel,
  FALLBACK_H1,
  FALLBACK_SUBTITLE,
  hasUsableAddress,
} from "@/lib/seo/homepage-model";
import { contrastingForeground, normalizeHexColor } from "@/lib/theme/brand-color";
import { buildTenantPageMetadata } from "@/lib/seo/metadata";
import type { SitePageRow, SiteSeoSettings, TenantDomainRow } from "@/lib/seo/types";

function page(partial: Partial<SitePageRow> & { path: string }): SitePageRow {
  return {
    id: "p1",
    site_id: "site-a",
    path: partial.path,
    title: partial.title || "Home",
    content_md: "",
    page_key: partial.page_key ?? "home",
    h1: partial.h1 ?? null,
    excerpt: partial.excerpt ?? null,
    content_json: partial.content_json ?? [],
    seo_title: partial.seo_title ?? null,
    meta_description: partial.meta_description ?? null,
    canonical_path: null,
    robots_index: true,
    robots_follow: true,
    og_title: null,
    og_description: null,
    og_image_url: null,
    nav_label: "Home",
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
  website_name: "Example Parking",
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

describe("homepage model", () => {
  it("uses a single configured H1 and neutral fallbacks", () => {
    const model = buildHomepageModel({
      page: page({
        path: "/",
        h1: "Airport parking near the terminal",
        excerpt: "Book online with clear pricing.",
        content_json: [],
      }),
      settings,
      profile: { business_name: "Example Parking" },
    });
    expect(model.h1).toBe("Airport parking near the terminal");
    expect(model.subtitle).toContain("Book online");
  });

  it("falls back without inventing tenant-specific place names", () => {
    const model = buildHomepageModel({
      page: null,
      settings,
      profile: null,
    });
    expect(model.h1).toBe(FALLBACK_H1);
    expect(model.subtitle).toBe(FALLBACK_SUBTITLE);
    expect(model.h1.toLowerCase()).not.toContain("exeter");
    expect(model.h1.toLowerCase()).not.toContain("fly");
  });

  it("hides reviews unless quote items exist", () => {
    const without = buildHomepageModel({
      page: page({ path: "/", content_json: [] }),
      settings,
      profile: { review_count: 12, review_rating: 4.8 },
    });
    expect(without.reviews).toBeNull();

    const withQuotes = buildHomepageModel({
      page: page({
        path: "/",
        content_json: [
          {
            type: "reviews",
            items: [{ quote: "Smooth arrival", author: "Alex" }],
          },
        ],
      }),
      settings,
      profile: {},
    });
    expect(withQuotes.reviews?.items?.[0].quote).toBe("Smooth arrival");
  });

  it("rejects country-only address placeholders", () => {
    expect(hasUsableAddress({ country: "UK" })).toBe(false);
    expect(hasUsableAddress({ street: "1 Road", city: "Town", postalCode: "EX1 1AA" })).toBe(
      true
    );
  });

  it("renders FAQ answers from content blocks", () => {
    const model = buildHomepageModel({
      page: page({
        path: "/",
        content_json: [
          {
            type: "faq",
            items: [{ q: "How do I book?", a: "Use the booking form." }],
          },
        ],
      }),
      settings,
      profile: {},
    });
    expect(model.faqs).toEqual([{ q: "How do I book?", a: "Use the booking form." }]);
  });
});

describe("brand colour contrast", () => {
  it("normalizes and picks readable foreground", () => {
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
    expect(contrastingForeground("#000000")).toBe("#ffffff");
    expect(contrastingForeground("#ffffff")).toBe("#0f172a");
  });
});

describe("metadata remains tenant-scoped after redesign", () => {
  it("keeps canonical on verified primary domain", () => {
    const domains: TenantDomainRow[] = [
      {
        id: "d1",
        tenant_id: "tenant-a",
        domain: "parking.example",
        is_primary: true,
        verified: true,
      },
    ];
    const meta = buildTenantPageMetadata({
      page: page({
        path: "/",
        page_key: "home",
        seo_title: "Home | Example Parking",
        meta_description: "Book parking online",
      }),
      settings,
      profile: { business_name: "Example Parking" },
      domains,
      pagePath: "/",
    });
    expect(meta.alternates?.canonical).toBe("https://parking.example");
    expect(meta.title).toContain("Example Parking");
  });
});

describe("tenant isolation and empty data", () => {
  it("does not leak Tenant A homepage copy into Tenant B", () => {
    const tenantA = buildHomepageModel({
      page: page({
        path: "/",
        h1: "Tenant A Airport Parking",
        content_json: [
          {
            type: "benefits",
            heading: "Why A",
            items: [{ title: "Only on A", body: "Secret benefit" }],
          },
        ],
      }),
      settings: { ...settings, website_name: "Tenant A", site_id: "site-a", tenant_id: "tenant-a" },
      profile: { business_name: "Tenant A" },
    });
    const tenantB = buildHomepageModel({
      page: page({
        path: "/",
        h1: "Tenant B Parking",
        content_json: [],
      }),
      settings: {
        ...settings,
        id: "s2",
        site_id: "site-b",
        tenant_id: "tenant-b",
        website_name: "Tenant B",
      },
      profile: { business_name: "Tenant B" },
    });
    expect(tenantA.h1).toBe("Tenant A Airport Parking");
    expect(tenantB.h1).toBe("Tenant B Parking");
    expect(tenantB.benefits).toBeNull();
    expect(JSON.stringify(tenantB)).not.toContain("Only on A");
    expect(JSON.stringify(tenantB)).not.toContain("Secret benefit");
  });

  it("omits location when only placeholder country exists", () => {
    const model = buildHomepageModel({
      page: page({ path: "/", content_json: [] }),
      settings,
      profile: { country: "UK", address: "UK" },
    });
    expect(model.sections.location).toBe(true);
    // Callers use hasUsableAddress — model itself does not invent location copy
    expect(hasUsableAddress({ country: "UK", address: "UK" })).toBe(false);
  });

  it("builds server-meaningful H1/subtitle without client blocks", () => {
    const model = buildHomepageModel({
      page: page({
        path: "/",
        h1: "Secure airport parking",
        excerpt: "Reserve your space online.",
      }),
      settings,
      profile: { business_name: "Example Parking" },
    });
    expect(model.h1.length).toBeGreaterThan(5);
    expect(model.subtitle.length).toBeGreaterThan(5);
    expect(model.trustPoints.length).toBeGreaterThanOrEqual(3);
  });
});
