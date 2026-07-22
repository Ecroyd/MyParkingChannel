/**
 * Unit tests for tenant SEO control centre pure logic.
 * These do not hit live Supabase; they lock invariants required by the SEO upgrade.
 */
import { describe, expect, it } from "vitest";
import {
  resolvePrimaryCanonicalHost,
  resolveCanonicalUrl,
  isPreviewOrDevHost,
  isUnsafeCanonicalHost,
  normalizeHostname,
} from "@/lib/seo/canonical";
import {
  resolveRobots,
  hasIndexableBookingQuery,
  shouldForceNoindexPage,
} from "@/lib/seo/indexing";
import {
  validateRedirectInput,
  resolveRedirect,
  detectRedirectLoop,
  previewRedirectChain,
} from "@/lib/seo/redirects";
import { buildSitemapXml, buildRobotsTxt } from "@/lib/seo/sitemap-robots";
import { buildFaqPageJsonLd, buildLocalBusinessJsonLd } from "@/lib/seo/json-ld";
import { parseContentBlocks, faqItemsWithAnswers } from "@/lib/seo/content-blocks";
import { buildTenantPageMetadata } from "@/lib/seo/metadata";
import { siteSeoCacheTag, siteHostCacheTag } from "@/lib/seo/cache";
import type { SitePageRow, SiteSeoSettings, TenantDomainRow } from "@/lib/seo/types";

const tenantADomains: TenantDomainRow[] = [
  {
    id: "d1",
    tenant_id: "tenant-a",
    domain: "parkingexeterairport.co.uk",
    is_primary: true,
    verified: true,
  },
  {
    id: "d2",
    tenant_id: "tenant-a",
    domain: "flyparksexeter.myparkingchannel.app",
    is_primary: false,
    verified: false,
  },
];

const tenantBDomains: TenantDomainRow[] = [
  {
    id: "d3",
    tenant_id: "tenant-b",
    domain: "other-parking.example",
    is_primary: true,
    verified: true,
  },
];

function page(partial: Partial<SitePageRow> & { path: string }): SitePageRow {
  return {
    id: partial.id || "p1",
    site_id: partial.site_id || "site-a",
    path: partial.path,
    title: partial.title || "Title",
    content_md: "",
    page_key: partial.page_key ?? null,
    h1: partial.h1 ?? null,
    excerpt: partial.excerpt ?? null,
    content_json: partial.content_json ?? [],
    seo_title: partial.seo_title ?? null,
    meta_description: partial.meta_description ?? null,
    canonical_path: partial.canonical_path ?? null,
    robots_index: partial.robots_index ?? null,
    robots_follow: partial.robots_follow ?? null,
    og_title: null,
    og_description: null,
    og_image_url: null,
    nav_label: null,
    nav_order: 0,
    show_in_navigation: false,
    status: partial.status || "published",
    published_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    created_at: "2026-07-01T00:00:00Z",
  };
}

const settingsA: SiteSeoSettings = {
  id: "s1",
  site_id: "site-a",
  tenant_id: "tenant-a",
  website_name: "Fly Parks Exeter",
  alternative_site_name: null,
  default_title_template: "{page} | {site}",
  default_meta_description: "Book Exeter Airport parking",
  default_og_image_url: null,
  default_robots_index: true,
  default_robots_follow: true,
  primary_language: "en-GB",
  allow_indexing: true,
  schema_business_type: "ParkingFacility",
  logo_url: null,
  favicon_url: null,
  indexing_mode: "live_indexable",
  migration_target_domain: "flyparksexeter.co.uk",
  migration_notes: null,
  canonical_domain_override: null,
  google_search_console_verification: null,
  ga4_measurement_id: null,
  google_tag_manager_id: null,
  bing_verification: null,
  microsoft_clarity_id: null,
  cookie_consent_mode: "basic",
  last_published_at: null,
  created_at: "",
  updated_at: "",
};

describe("public domain resolves correct site canonical host", () => {
  it("uses verified primary for tenant A, not tenant B", () => {
    const a = resolvePrimaryCanonicalHost(tenantADomains);
    const b = resolvePrimaryCanonicalHost(tenantBDomains);
    expect(a).toBe("parkingexeterairport.co.uk");
    expect(b).toBe("other-parking.example");
    expect(a).not.toBe(b);
  });

  it("never picks platform/preview hosts", () => {
    expect(
      resolvePrimaryCanonicalHost([
        { domain: "flyparksexeter.myparkingchannel.app", is_primary: true, verified: true },
      ])
    ).toBeNull();
    expect(isPreviewOrDevHost("foo.vercel.app")).toBe(true);
    expect(isUnsafeCanonicalHost("myparkingchannel.app")).toBe(true);
  });
});

describe("metadata belongs to correct tenant", () => {
  it("builds title/description/canonical for tenant A only", () => {
    const meta = buildTenantPageMetadata({
      page: page({
        path: "/",
        page_key: "home",
        seo_title: "Exeter Airport Parking | Fly Parks Exeter",
        meta_description: "Book Exeter Airport parking",
      }),
      settings: settingsA,
      profile: { business_name: "Fly Parks Exeter" },
      domains: tenantADomains,
      pagePath: "/",
    });
    expect(meta.title).toContain("Fly Parks Exeter");
    expect(meta.alternates?.canonical).toBe("https://parkingexeterairport.co.uk");
    expect(String(meta.alternates?.canonical)).not.toContain("other-parking");
  });
});

describe("canonical uses verified primary domain", () => {
  it("ignores unverified and platform hosts", () => {
    const { url, host } = resolveCanonicalUrl({
      domains: [
        { domain: "www.parkingexeterairport.co.uk", is_primary: true, verified: false },
        { domain: "parkingexeterairport.co.uk", is_primary: false, verified: true },
      ],
      pagePath: "/faq",
    });
    expect(host).toBe("parkingexeterairport.co.uk");
    expect(url).toBe("https://parkingexeterairport.co.uk/faq");
  });
});

describe("preview domain is noindex", () => {
  it("forces noindex on vercel and platform preview hosts", () => {
    const robots = resolveRobots({
      page: page({ path: "/", page_key: "home", robots_index: true }),
      settings: settingsA,
      requestHost: "preview-abc.vercel.app",
    });
    expect(robots.index).toBe(false);
    expect(robots.reason).toBe("preview_host");
  });
});

describe("transactional pages are noindex", () => {
  it("manage booking is noindex", () => {
    expect(shouldForceNoindexPage("manage_booking")).toBe(true);
    const robots = resolveRobots({
      page: page({ path: "/manage-booking", page_key: "manage_booking", robots_index: true }),
      settings: settingsA,
      requestHost: "parkingexeterairport.co.uk",
    });
    expect(robots.index).toBe(false);
    expect(robots.follow).toBe(true);
  });

  it("checkout/payment/confirmation are noindex", () => {
    for (const key of ["checkout", "payment", "confirmation"] as const) {
      expect(shouldForceNoindexPage(key)).toBe(true);
    }
  });

  it("date query booking results are noindex", () => {
    expect(hasIndexableBookingQuery(new URLSearchParams("from=2026-08-01&to=2026-08-08"))).toBe(
      true
    );
    const robots = resolveRobots({
      page: page({ path: "/book", page_key: "book", robots_index: true }),
      settings: settingsA,
      requestHost: "parkingexeterairport.co.uk",
      hasBookingQuery: true,
    });
    expect(robots.index).toBe(false);
  });
});

describe("sitemap and robots are tenant-scoped", () => {
  const pages = [
    page({ path: "/", page_key: "home", robots_index: true, status: "published" }),
    page({ path: "/faq", page_key: "faq", robots_index: true, status: "published" }),
    page({ path: "/draft", robots_index: true, status: "draft" }),
    page({
      path: "/manage-booking",
      page_key: "manage_booking",
      robots_index: false,
      status: "published",
    }),
    page({ path: "/hidden", robots_index: false, status: "published" }),
  ];

  it("published indexable pages appear for correct tenant host", () => {
    const xml = buildSitemapXml({
      pages,
      settings: settingsA,
      domains: tenantADomains,
    });
    expect(xml).toContain("https://parkingexeterairport.co.uk</loc>");
    expect(xml).toContain("https://parkingexeterairport.co.uk/faq");
    expect(xml).not.toContain("other-parking.example");
  });

  it("draft/noindex pages do not appear", () => {
    const xml = buildSitemapXml({
      pages,
      settings: settingsA,
      domains: tenantADomains,
    });
    expect(xml).not.toContain("/draft");
    expect(xml).not.toContain("/manage-booking");
    expect(xml).not.toContain("/hidden");
  });

  it("robots.txt references correct tenant sitemap", () => {
    const txt = buildRobotsTxt({
      settings: settingsA,
      domains: tenantADomains,
    });
    expect(txt).toContain("Sitemap: https://parkingexeterairport.co.uk/sitemap.xml");
    expect(txt).toContain("Disallow: /manage-booking");
    expect(txt).not.toContain("other-parking.example");
  });
});

describe("JSON-LD tenant business details and FAQ answers", () => {
  it("includes tenant business details", () => {
    const ld = buildLocalBusinessJsonLd({
      profile: {
        business_name: "Fly Parks Exeter",
        email: "info@flyparksexeter.co.uk",
        latitude: 50.729598,
        longitude: -3.415369,
      },
      url: "https://parkingexeterairport.co.uk",
    });
    expect(ld?.name).toBe("Fly Parks Exeter");
    expect(ld?.email).toBe("info@flyparksexeter.co.uk");
    expect(ld?.url).toBe("https://parkingexeterairport.co.uk");
  });

  it("omits FAQPage when no visible answers exist", () => {
    expect(buildFaqPageJsonLd([{ q: "Only question?", a: "" }])).toBeNull();
    expect(buildFaqPageJsonLd([])).toBeNull();
    const blocks = parseContentBlocks([
      { type: "faq", items: [{ q: "Q?", a: "" }] },
    ]);
    expect(faqItemsWithAnswers(blocks)).toEqual([]);
  });

  it("includes FAQPage only with answers", () => {
    const ld = buildFaqPageJsonLd([{ q: "How do I book?", a: "Use the form." }]);
    expect(ld?.["@type"]).toBe("FAQPage");
  });
});

describe("redirects", () => {
  it("returns configured HTTP status", () => {
    const hit = resolveRedirect(
      [{ old_path: "/old", new_path: "/new", status_code: 302, active: true }],
      "/old"
    );
    expect(hit).toEqual({ to: "/new", status: 302 });
  });

  it("rejects redirect loops", () => {
    const existing = [
      { id: "1", old_path: "/a", new_path: "/b", active: true },
      { id: "2", old_path: "/b", new_path: "/a", active: true },
    ];
    expect(detectRedirectLoop(existing, "/a", "/b")).toBe(true);
    const validation = validateRedirectInput({
      oldPath: "/c",
      newPath: "/a",
      statusCode: 301,
      existing: [
        { id: "1", old_path: "/a", new_path: "/c", active: true },
      ],
    });
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.error).toBe("redirect_loop");
  });

  it("previews redirect chain", () => {
    const chain = previewRedirectChain(
      [
        { old_path: "/a", new_path: "/b", status_code: 301, active: true },
        { old_path: "/b", new_path: "/c", status_code: 301, active: true },
      ],
      "/a"
    );
    expect(chain.chain).toEqual(["/a", "/b", "/c"]);
    expect(chain.loop).toBe(false);
  });
});

describe("cache isolation by site", () => {
  it("cache tags include site id / host and cannot collide across tenants", () => {
    const a = siteSeoCacheTag("site-a");
    const b = siteSeoCacheTag("site-b");
    expect(a).toBe("site-seo:site-a");
    expect(b).toBe("site-seo:site-b");
    expect(a).not.toBe(b);
    expect(siteHostCacheTag("www.ParkingExeterAirport.co.uk")).toBe(
      "site-host:parkingexeterairport.co.uk"
    );
  });
});

describe("content blocks fail safely", () => {
  it("skips unknown/malformed blocks", () => {
    const blocks = parseContentBlocks([
      { type: "not_a_real_block", heading: "x" },
      null,
      "bad",
      { type: "rich_text", heading: "OK", body: "Hello" },
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("rich_text");
  });
});

describe("hostname helpers", () => {
  it("normalizes www", () => {
    expect(normalizeHostname("www.parkingexeterairport.co.uk")).toBe(
      "parkingexeterairport.co.uk"
    );
  });
});
