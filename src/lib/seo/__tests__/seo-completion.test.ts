import { describe, expect, it } from "vitest";
import {
  formatAddressLines,
  formatAddressSingleLine,
  hasUsableAddress,
} from "@/lib/seo/public-address";
import { resolveRobots, shouldForceNoindexPage } from "@/lib/seo/indexing";
import { buildHomepageModel, fallbackH1WithBusinessName } from "@/lib/seo/homepage-model";
import { buildLocalBusinessJsonLd } from "@/lib/seo/json-ld";
import { buildTenantPageMetadata } from "@/lib/seo/metadata";
import { faqItemsWithAnswers } from "@/lib/seo/content-blocks";
import type { SitePageRow, SiteSeoSettings, TenantDomainRow } from "@/lib/seo/types";

function page(partial: Partial<SitePageRow> & { path: string }): SitePageRow {
  return {
    id: "p1",
    site_id: "site-a",
    path: partial.path,
    title: partial.title || "Page",
    content_md: "",
    page_key: partial.page_key ?? null,
    h1: partial.h1 ?? null,
    excerpt: partial.excerpt ?? null,
    content_json: partial.content_json ?? [],
    seo_title: partial.seo_title ?? null,
    meta_description: partial.meta_description ?? null,
    canonical_path: null,
    robots_index: partial.robots_index ?? true,
    robots_follow: true,
    og_title: null,
    og_description: null,
    og_image_url: null,
    nav_label: null,
    nav_order: 0,
    show_in_navigation: false,
    status: partial.status ?? "published",
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

describe("SEO completion — H1 and address", () => {
  it("homepage model exposes exactly one configured H1 for the tenant", () => {
    const model = buildHomepageModel({
      page: page({
        path: "/",
        page_key: "home",
        h1: "Secure Airport Parking with Example Parking",
      }),
      settings,
      profile: { business_name: "Example Parking" },
    });
    expect(model.h1).toBe("Secure Airport Parking with Example Parking");
    expect(model.h1).toContain("Example Parking");
  });

  it("falls back to Secure Airport Parking with business name", () => {
    expect(fallbackH1WithBusinessName("Fly Parks Exeter")).toBe(
      "Secure Airport Parking with Fly Parks Exeter"
    );
  });

  it("does not render UK/GB as an address", () => {
    expect(hasUsableAddress({ country: "UK" })).toBe(false);
    expect(hasUsableAddress({ country: "GB" })).toBe(false);
    expect(formatAddressSingleLine({ address: { country: "GB" }, country: "GB" })).toBeNull();
    expect(formatAddressLines({ address: { street: "1 Road", city: "Town", postalCode: "EX1 1AA" } })).toEqual([
      "1 Road",
      "Town EX1 1AA",
    ]);
  });
});

describe("SEO completion — FAQ answers", () => {
  it("keeps only FAQ items with visible answers", () => {
    const faqs = faqItemsWithAnswers(
      [
        {
          id: "f",
          type: "faq",
          items: [
            { q: "How do I book?", a: "Use the booking form." },
            { q: "No answer yet", a: "" },
          ],
        },
      ],
      null
    );
    expect(faqs).toEqual([{ q: "How do I book?", a: "Use the booking form." }]);
  });
});

describe("SEO completion — indexing", () => {
  it("manage booking is noindex,follow", () => {
    expect(shouldForceNoindexPage("manage_booking")).toBe(true);
    const robots = resolveRobots({
      page: page({ path: "/manage-booking", page_key: "manage_booking", robots_index: true }),
      settings,
      requestHost: "parkingexeterairport.co.uk",
    });
    expect(robots.index).toBe(false);
    expect(robots.follow).toBe(true);
  });

  it("checkout/payment/confirmation are noindex", () => {
    for (const key of ["checkout", "payment", "confirmation"] as const) {
      const robots = resolveRobots({
        page: page({ path: `/${key}`, page_key: key }),
        settings,
        requestHost: "parkingexeterairport.co.uk",
      });
      expect(robots.index).toBe(false);
      expect(robots.follow).toBe(true);
    }
  });

  it("preview host is noindex", () => {
    const robots = resolveRobots({
      page: page({ path: "/", page_key: "home" }),
      settings,
      requestHost: "flyparksexeter.myparkingchannel.app",
    });
    expect(robots.index).toBe(false);
  });

  it("canonical_to_existing noindexes non-canonical hosts", () => {
    const robots = resolveRobots({
      page: page({ path: "/", page_key: "home" }),
      settings: { ...settings, indexing_mode: "canonical_to_existing" },
      requestHost: "parkingexeterairport.co.uk",
      canonicalHost: "flyparksexeter.co.uk",
    });
    expect(robots.index).toBe(false);
    expect(robots.reason).toBe("canonical_to_existing_host_mismatch");
  });

  it("canonical uses verified primary domain", () => {
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
      page: page({ path: "/", page_key: "home", seo_title: "Home | Example" }),
      settings,
      profile: { business_name: "Example Parking" },
      domains,
      pagePath: "/",
    });
    expect(meta.alternates?.canonical).toBe("https://parking.example");
  });
});

describe("SEO completion — LocalBusiness and legal routes", () => {
  it("LocalBusiness omits country-only postal address", () => {
    const ld = buildLocalBusinessJsonLd({
      profile: {
        business_name: "Example Parking",
        country: "GB",
        address: { country: "GB" },
      },
      url: "https://parking.example/",
    });
    expect(ld).not.toBeNull();
    expect(ld?.address).toBeUndefined();
  });

  it("LocalBusiness uses tenant street data when complete", () => {
    const ld = buildLocalBusinessJsonLd({
      profile: {
        business_name: "Tenant A",
        address: { street: "1 Lane", city: "Town", postalCode: "EX1 1AA" },
      },
      url: "https://a.example/",
    });
    expect(ld?.name).toBe("Tenant A");
    expect((ld?.address as { streetAddress?: string })?.streetAddress).toBe("1 Lane");
  });

  it("terms and privacy are distinct routes from contact", () => {
    expect("/terms").not.toBe("/contact");
    expect("/privacy").not.toBe("/contact");
  });
});
