import { describe, expect, it } from "vitest";
import {
  buildAreaServed,
  buildBookUrl,
  buildEntityIds,
  buildFaqPageJsonLd,
  buildLocalBusinessJsonLd,
  collectPageJsonLdScripts,
} from "@/lib/seo/json-ld";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";
import { buildHomepageModel } from "@/lib/seo/homepage-model";
import type { SitePageRow, SiteSeoSettings, TenantDomainRow } from "@/lib/seo/types";

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
    seo_title: partial.seo_title ?? null,
    meta_description: partial.meta_description ?? null,
    canonical_path: null,
    robots_index: true,
    robots_follow: true,
    og_title: null,
    og_description: null,
    og_image_url: null,
    nav_label: partial.nav_label ?? null,
    nav_order: 0,
    show_in_navigation: true,
    status: "published",
    published_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    created_at: "2026-07-01T00:00:00Z",
  };
}

const settingsA: SiteSeoSettings = {
  id: "s1",
  site_id: "site-a",
  tenant_id: "tenant-a",
  website_name: "Tenant A Parking",
  alternative_site_name: "Tenant A",
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
  presentation_json: {
    googleReviews: { mapsUrlOverride: "https://maps.google.com/?cid=tenant-a" },
  },
  created_at: "",
  updated_at: "",
};

const profileA = {
  business_name: "Tenant A Parking",
  alternative_name: "Tenant A",
  business_description:
    "Secure airport parking with straightforward booking for travellers.",
  phone: "+441111111111",
  email: "a@example.com",
  address: { street: "1 Road", city: "Town", postalCode: "EX1 1AA", country: "GB" },
  latitude: 50.7,
  longitude: -3.4,
  airports: ["Exeter Airport"],
  features: ["CCTV"],
  facebook_url: "https://facebook.com/tenanta",
};

const domainsA: TenantDomainRow[] = [
  {
    id: "d1",
    tenant_id: "tenant-a",
    domain: "tenant-a.example",
    is_primary: true,
    verified: true,
  },
];

function parseGraph(scripts: string[]) {
  expect(scripts.length).toBeGreaterThan(0);
  const root = JSON.parse(scripts[0]!);
  expect(root["@graph"]).toBeDefined();
  return root["@graph"] as Array<Record<string, unknown>>;
}

describe("AI schema entity graph", () => {
  it("links Organization, LocalBusiness and Service via @id", () => {
    const scripts = collectPageJsonLdScripts({
      page: page({ path: "/", page_key: "home" }),
      settings: settingsA,
      profile: profileA,
      siteUrl: "https://tenant-a.example/",
      pageUrl: "https://tenant-a.example/",
      includeLocalBusiness: true,
      includeService: true,
    });
    const graph = parseGraph(scripts);
    const ids = buildEntityIds("https://tenant-a.example/", "https://tenant-a.example/");

    const website = graph.find((n) => n["@type"] === "WebSite");
    const org = graph.find((n) => n["@type"] === "Organization");
    const lb = graph.find((n) => n["@type"] === "ParkingFacility");
    const service = graph.find((n) => n["@type"] === "Service");
    const webpage = graph.find((n) => n["@type"] === "WebPage");

    expect(website?.["@id"]).toBe(ids.website);
    expect(org?.["@id"]).toBe(ids.organization);
    expect(lb?.["@id"]).toBe(ids.localBusiness);
    expect(service?.["@id"]).toBe(ids.service);
    expect(webpage?.["@id"]).toBe(ids.webpage);

    expect(website?.publisher).toEqual({ "@id": ids.organization });
    expect(lb?.parentOrganization).toEqual({ "@id": ids.organization });
    expect(service?.provider).toEqual({ "@id": ids.localBusiness });
    expect(webpage?.isPartOf).toEqual({ "@id": ids.website });
    expect(webpage?.about).toEqual({ "@id": ids.localBusiness });
    expect(webpage?.mainEntity).toEqual({ "@id": ids.service });
  });

  it("emits areaServed only when airports are present", () => {
    expect(buildAreaServed(["Exeter Airport"])).toEqual([
      { "@type": "Airport", name: "Exeter Airport" },
    ]);
    expect(buildAreaServed([])).toBeUndefined();
    expect(buildAreaServed(null)).toBeUndefined();

    const withAirports = collectPageJsonLdScripts({
      page: page({ path: "/", page_key: "home" }),
      settings: settingsA,
      profile: profileA,
      siteUrl: "https://tenant-a.example/",
      pageUrl: "https://tenant-a.example/",
      includeLocalBusiness: true,
    });
    expect(withAirports[0]).toContain("Exeter Airport");

    const without = collectPageJsonLdScripts({
      page: page({ path: "/", page_key: "home" }),
      settings: settingsA,
      profile: { ...profileA, airports: [] },
      siteUrl: "https://tenant-a.example/",
      pageUrl: "https://tenant-a.example/",
      includeLocalBusiness: true,
    });
    expect(without[0]).not.toContain("areaServed");
  });

  it("uses ReserveAction for book URL and never emits Offer nodes", () => {
    const scripts = collectPageJsonLdScripts({
      page: page({ path: "/book", page_key: "book", title: "Book" }),
      settings: settingsA,
      profile: profileA,
      siteUrl: "https://tenant-a.example/",
      pageUrl: "https://tenant-a.example/book",
      includeLocalBusiness: false,
      includeService: true,
      breadcrumbs: [
        { name: "Home", url: "https://tenant-a.example/" },
        { name: "Book", url: "https://tenant-a.example/book" },
      ],
    });
    const joined = scripts.join("\n");
    expect(joined).toContain("ReserveAction");
    expect(joined).toContain(buildBookUrl("https://tenant-a.example/"));
    expect(joined).not.toMatch(/"@type":"Offer"/);
    expect(joined).not.toMatch(/priceCurrency/);
    expect(joined).not.toContain("SearchAction");
  });

  it("does not invent AggregateRating without profile rating+count", () => {
    const ld = buildLocalBusinessJsonLd({
      profile: profileA,
      url: "https://tenant-a.example/",
    });
    expect(ld?.aggregateRating).toBeUndefined();
    expect(JSON.stringify(ld)).not.toMatch(/"@type":"Review"/);
  });

  it("uses site root as LocalBusiness url on contact graphs", () => {
    const scripts = collectPageJsonLdScripts({
      page: page({ path: "/contact", page_key: "contact", title: "Contact" }),
      settings: settingsA,
      profile: profileA,
      siteUrl: "https://tenant-a.example/",
      pageUrl: "https://tenant-a.example/contact",
      includeLocalBusiness: true,
    });
    const graph = parseGraph(scripts);
    const lb = graph.find((n) => n["@type"] === "ParkingFacility");
    expect(lb?.url).toBe("https://tenant-a.example/");
    expect(lb?.url).not.toContain("/contact");
  });

  it("omits FAQPage when answers are empty", () => {
    const faq = buildFaqPageJsonLd([{ q: "How do I book?", a: "" }]);
    expect(faq).toBeNull();

    const scripts = collectPageJsonLdScripts({
      page: page({
        path: "/",
        content_json: [{ type: "faq", items: [{ q: "How?", a: "" }] }],
      }),
      settings: settingsA,
      profile: { ...profileA, faq: [{ q: "How?", a: "" }] },
      siteUrl: "https://tenant-a.example/",
      pageUrl: "https://tenant-a.example/",
      includeLocalBusiness: true,
      includeFaq: true,
    });
    expect(scripts.every((s) => !s.includes('"FAQPage"'))).toBe(true);
  });

  it("includes Maps sameAs from google reviews maps override", () => {
    const scripts = collectPageJsonLdScripts({
      page: page({ path: "/" }),
      settings: settingsA,
      profile: profileA,
      siteUrl: "https://tenant-a.example/",
      pageUrl: "https://tenant-a.example/",
      includeLocalBusiness: true,
    });
    expect(scripts[0]).toContain("https://maps.google.com/?cid=tenant-a");
  });

  it("isolates Tenant A airports/name from Tenant B graph", () => {
    const scriptsB = collectPageJsonLdScripts({
      page: page({ path: "/" }),
      settings: {
        ...settingsA,
        website_name: "Tenant B Parking",
        tenant_id: "tenant-b",
        site_id: "site-b",
        presentation_json: {},
      },
      profile: {
        business_name: "Tenant B Parking",
        airports: ["Bristol Airport"],
        business_description: "Tenant B secure parking near the airport terminal.",
      },
      siteUrl: "https://tenant-b.example/",
      pageUrl: "https://tenant-b.example/",
      includeLocalBusiness: true,
    });
    const joined = scriptsB.join("\n");
    expect(joined).toContain("Tenant B Parking");
    expect(joined).toContain("Bristol Airport");
    expect(joined).not.toContain("Tenant A Parking");
    expect(joined).not.toContain("Exeter Airport");
  });
});

describe("llms.txt", () => {
  it("includes name and book URL without invented review text", () => {
    const { body, status } = buildLlmsTxt({
      settings: settingsA,
      profile: profileA,
      domains: domainsA,
      sitePrimaryDomain: "tenant-a.example",
    });
    expect(status).toBe(200);
    expect(body).toContain("Tenant A Parking");
    expect(body).toContain("https://tenant-a.example/book");
    expect(body).toContain("Exeter Airport");
    expect(body).not.toMatch(/5 star|amazing stay|review text/i);
  });

  it("returns 404 when staging_noindex", () => {
    const { status } = buildLlmsTxt({
      settings: { ...settingsA, indexing_mode: "staging_noindex" },
      profile: profileA,
      domains: domainsA,
    });
    expect(status).toBe(404);
  });
});

describe("homepage SEO unaffected", () => {
  it("keeps configured H1", () => {
    const model = buildHomepageModel({
      page: page({
        path: "/",
        h1: "Secure Airport Parking with Tenant A",
      }),
      settings: settingsA,
      profile: { business_name: "Tenant A Parking" },
    });
    expect(model.h1).toBe("Secure Airport Parking with Tenant A");
  });
});
