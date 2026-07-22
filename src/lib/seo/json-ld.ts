import { faqItemsWithAnswers, parseContentBlocks, type FaqItem } from "./content-blocks";
import type { SitePageRow, SiteSeoSettings } from "./types";

export type JsonLdProfile = {
  business_name?: string | null;
  alternative_name?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  price_range?: string | null;
  address?: {
    street?: string;
    streetAddress?: string;
    city?: string;
    addressLocality?: string;
    county?: string;
    addressRegion?: string;
    postalCode?: string;
    country?: string;
    addressCountry?: string;
  } | null;
  county?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  geo?: { lat?: number; lng?: number } | null;
  hours?: Array<{ day?: string; open?: string; close?: string }> | null;
  features?: string[] | null;
  airports?: string[] | null;
  faq?: unknown;
  logo_url?: string | null;
  business_description?: string | null;
  about_text?: string | null;
  facebook_url?: string | null;
  twitter_url?: string | null;
  instagram_url?: string | null;
  linkedin_url?: string | null;
  external_review_links?: unknown;
  /** Do not invent ratings — only include when present and positive. */
  review_rating?: number | string | null;
  review_count?: number | null;
};

function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function postalAddress(profile: JsonLdProfile) {
  const a = profile.address;
  if (!a && !profile.county && !profile.country) return undefined;
  const street = a?.streetAddress || a?.street;
  const city = a?.addressLocality || a?.city;
  const region = a?.addressRegion || a?.county || profile.county || undefined;
  const postal = a?.postalCode;
  const country = a?.addressCountry || a?.country || profile.country || "GB";
  if (!street && !city && !postal && !region) return undefined;
  return {
    "@type": "PostalAddress",
    streetAddress: street || undefined,
    addressLocality: city || undefined,
    addressRegion: region || undefined,
    postalCode: postal || undefined,
    addressCountry: country,
  };
}

function geoCoordinates(profile: JsonLdProfile) {
  const lat = profile.latitude ?? profile.geo?.lat;
  const lng = profile.longitude ?? profile.geo?.lng;
  if (lat == null || lng == null || lat === "" || lng === "") return undefined;
  return {
    "@type": "GeoCoordinates",
    latitude: Number(lat),
    longitude: Number(lng),
  };
}

function openingHours(profile: JsonLdProfile) {
  if (!Array.isArray(profile.hours) || !profile.hours.length) return undefined;
  return profile.hours
    .filter((h) => h?.day && h?.open && h?.close)
    .map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.day,
      opens: h.open,
      closes: h.close,
    }));
}

function sameAs(profile: JsonLdProfile): string[] | undefined {
  const links = [
    profile.facebook_url,
    profile.twitter_url,
    profile.instagram_url,
    profile.linkedin_url,
  ].filter((x): x is string => Boolean(x && x.trim()));

  if (Array.isArray(profile.external_review_links)) {
    for (const raw of profile.external_review_links) {
      if (typeof raw === "string" && raw.trim()) links.push(raw.trim());
      else if (raw && typeof raw === "object" && "url" in raw) {
        const u = (raw as { url?: string }).url;
        if (u?.trim()) links.push(u.trim());
      }
    }
  }
  return links.length ? links : undefined;
}

export function buildWebsiteJsonLd(args: {
  name: string;
  url: string;
  searchUrl?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: args.name,
    url: args.url,
    potentialAction: args.searchUrl
      ? {
          "@type": "SearchAction",
          target: `${args.searchUrl}?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        }
      : undefined,
  };
}

export function buildOrganizationJsonLd(args: {
  profile: JsonLdProfile;
  url: string;
  logo?: string | null;
}) {
  const name = args.profile.business_name;
  if (!name) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    alternateName: args.profile.alternative_name || undefined,
    url: args.url,
    logo: args.logo || args.profile.logo_url || undefined,
    email: args.profile.email || undefined,
    telephone: args.profile.phone || undefined,
    sameAs: sameAs(args.profile),
  };
}

export function buildLocalBusinessJsonLd(args: {
  profile: JsonLdProfile;
  url: string;
  schemaType?: string | null;
  logo?: string | null;
}) {
  const name = args.profile.business_name;
  if (!name) return null;

  const schemaType = args.schemaType || "ParkingFacility";
  const rating =
    args.profile.review_count &&
    Number(args.profile.review_count) > 0 &&
    args.profile.review_rating != null
      ? {
          "@type": "AggregateRating",
          ratingValue: Number(args.profile.review_rating),
          reviewCount: Number(args.profile.review_count),
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": schemaType,
    name,
    alternateName: args.profile.alternative_name || undefined,
    description:
      args.profile.business_description ||
      args.profile.about_text ||
      undefined,
    url: args.url,
    telephone: args.profile.phone || undefined,
    email: args.profile.email || undefined,
    priceRange: args.profile.price_range || undefined,
    image: args.logo || args.profile.logo_url || undefined,
    address: postalAddress(args.profile),
    geo: geoCoordinates(args.profile),
    openingHoursSpecification: openingHours(args.profile),
    aggregateRating: rating,
    sameAs: sameAs(args.profile),
    amenityFeature: Array.isArray(args.profile.features)
      ? args.profile.features.map((f) => ({
          "@type": "LocationFeatureSpecification",
          name: f,
        }))
      : undefined,
  };
}

export function buildWebPageJsonLd(args: {
  name: string;
  url: string;
  description?: string;
  isPartOfUrl?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: args.name,
    url: args.url,
    description: args.description,
    isPartOf: args.isPartOfUrl
      ? { "@type": "WebSite", url: args.isPartOfUrl }
      : undefined,
  };
}

export function buildBreadcrumbJsonLd(
  items: Array<{ name: string; url: string }>
) {
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildFaqPageJsonLd(items: FaqItem[]) {
  const withAnswers = items.filter((i) => i.q.trim() && i.a.trim());
  if (!withAnswers.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: withAnswers.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function collectPageJsonLdScripts(args: {
  page: SitePageRow | null;
  settings: SiteSeoSettings | null;
  profile: JsonLdProfile | null;
  siteUrl: string | null;
  pageUrl: string | null;
  includeLocalBusiness?: boolean;
  breadcrumbs?: Array<{ name: string; url: string }>;
}): string[] {
  if (!args.siteUrl || !args.pageUrl || !args.profile) return [];

  const scripts: string[] = [];
  const name =
    args.settings?.website_name ||
    args.profile.business_name ||
    "Airport Parking";

  scripts.push(
    safeJsonLd(
      buildWebsiteJsonLd({
        name,
        url: args.siteUrl,
      })
    )
  );

  const org = buildOrganizationJsonLd({
    profile: args.profile,
    url: args.siteUrl,
    logo: args.settings?.logo_url,
  });
  if (org) scripts.push(safeJsonLd(org));

  if (args.includeLocalBusiness !== false) {
    const lb = buildLocalBusinessJsonLd({
      profile: args.profile,
      url: args.siteUrl,
      schemaType: args.settings?.schema_business_type,
      logo: args.settings?.logo_url,
    });
    if (lb) scripts.push(safeJsonLd(lb));
  }

  scripts.push(
    safeJsonLd(
      buildWebPageJsonLd({
        name: args.page?.seo_title || args.page?.title || name,
        url: args.pageUrl,
        description: args.page?.meta_description || undefined,
        isPartOfUrl: args.siteUrl,
      })
    )
  );

  if (args.breadcrumbs?.length) {
    const bc = buildBreadcrumbJsonLd(args.breadcrumbs);
    if (bc) scripts.push(safeJsonLd(bc));
  }

  const blocks = parseContentBlocks(args.page?.content_json);
  const faqs = faqItemsWithAnswers(blocks, args.profile.faq);
  const faqLd = buildFaqPageJsonLd(faqs);
  if (faqLd) scripts.push(safeJsonLd(faqLd));

  return scripts;
}
