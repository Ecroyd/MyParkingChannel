import { faqItemsWithAnswers, parseContentBlocks, type FaqItem } from "./content-blocks";
import type { SitePageRow, SiteSeoSettings } from "./types";
import { hasUsableAddress, isPlaceholderCountry } from "./public-address";
import { parseGoogleReviewsConfig } from "./google-reviews-config";

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

export type EntityIds = {
  website: string;
  organization: string;
  localBusiness: string;
  service: string;
  webpage: string;
  place: string;
};

function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "") || url;
}

export function buildEntityIds(siteUrl: string, pageUrl: string): EntityIds {
  const base = stripTrailingSlash(siteUrl);
  const page = stripTrailingSlash(pageUrl) || base;
  return {
    website: `${base}/#website`,
    organization: `${base}/#organization`,
    localBusiness: `${base}/#localbusiness`,
    service: `${base}/#service-parking`,
    webpage: `${page}#webpage`,
    place: `${base}/#place`,
  };
}

function postalAddress(profile: JsonLdProfile) {
  const a = profile.address;
  if (!hasUsableAddress(a)) return undefined;
  const street = a?.streetAddress || a?.street;
  const city = a?.addressLocality || a?.city;
  const region = a?.addressRegion || a?.county || profile.county || undefined;
  const postal = a?.postalCode;
  const countryRaw = a?.addressCountry || a?.country || profile.country || null;
  const country =
    countryRaw && !isPlaceholderCountry(countryRaw) ? countryRaw : undefined;
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

export function buildAreaServed(airports?: string[] | null) {
  if (!Array.isArray(airports) || !airports.length) return undefined;
  const places = airports
    .map((a) => (typeof a === "string" ? a.trim() : ""))
    .filter(Boolean)
    .map((name) => ({
      "@type": "Airport",
      name,
    }));
  return places.length ? places : undefined;
}

export function collectSameAsUrls(
  profile: JsonLdProfile,
  extraMapsUrl?: string | null
): string[] | undefined {
  const links = [
    profile.facebook_url,
    profile.twitter_url,
    profile.instagram_url,
    profile.linkedin_url,
    extraMapsUrl,
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

  const unique = [...new Set(links.map((l) => l.trim()).filter(Boolean))];
  return unique.length ? unique : undefined;
}

function sameAs(
  profile: JsonLdProfile,
  extraMapsUrl?: string | null
): string[] | undefined {
  return collectSameAsUrls(profile, extraMapsUrl);
}

export function resolveMapsUrlFromSettings(
  settings: SiteSeoSettings | null | undefined
): string | null {
  const gr = parseGoogleReviewsConfig(settings?.presentation_json);
  return gr.mapsUrlOverride?.trim() || null;
}

export function buildReserveAction(bookUrl: string) {
  return {
    "@type": "ReserveAction",
    name: "Book parking",
    target: {
      "@type": "EntryPoint",
      urlTemplate: bookUrl,
      actionPlatform: [
        "http://schema.org/DesktopWebPlatform",
        "http://schema.org/MobileWebPlatform",
      ],
    },
  };
}

export function buildBookUrl(siteUrl: string): string {
  const base = stripTrailingSlash(siteUrl);
  return `${base}/book`;
}

/** Prefer ReserveAction via bookUrl — SearchAction is unused for tenant sites. */
export function buildWebsiteJsonLd(args: {
  name: string;
  url: string;
  searchUrl?: string;
  id?: string;
  publisherId?: string;
  bookUrl?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    ...(args.id ? { "@id": args.id } : {}),
    name: args.name,
    url: args.url,
    publisher: args.publisherId ? { "@id": args.publisherId } : undefined,
    potentialAction: args.bookUrl
      ? buildReserveAction(args.bookUrl)
      : args.searchUrl
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
  id?: string;
  alternateSiteName?: string | null;
  mapsUrl?: string | null;
}) {
  const name = args.profile.business_name;
  if (!name) return null;
  const alternateName =
    args.profile.alternative_name || args.alternateSiteName || undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    ...(args.id ? { "@id": args.id } : {}),
    name,
    alternateName,
    url: args.url,
    logo: args.logo || args.profile.logo_url || undefined,
    email: args.profile.email || undefined,
    telephone: args.profile.phone || undefined,
    address: postalAddress(args.profile),
    sameAs: sameAs(args.profile, args.mapsUrl),
  };
}

export function buildLocalBusinessJsonLd(args: {
  profile: JsonLdProfile;
  url: string;
  schemaType?: string | null;
  logo?: string | null;
  id?: string;
  organizationId?: string;
  mapsUrl?: string | null;
  alternateSiteName?: string | null;
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

  const maps = args.mapsUrl?.trim() || undefined;

  return {
    "@context": "https://schema.org",
    "@type": schemaType,
    ...(args.id ? { "@id": args.id } : {}),
    name,
    alternateName:
      args.profile.alternative_name || args.alternateSiteName || undefined,
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
    sameAs: sameAs(args.profile, maps),
    hasMap: maps,
    areaServed: buildAreaServed(args.profile.airports),
    amenityFeature: Array.isArray(args.profile.features)
      ? args.profile.features.map((f) => ({
          "@type": "LocationFeatureSpecification",
          name: f,
        }))
      : undefined,
    parentOrganization: args.organizationId
      ? { "@id": args.organizationId }
      : undefined,
  };
}

export function buildParkingServiceJsonLd(args: {
  profile: JsonLdProfile;
  id: string;
  providerId: string;
  bookUrl: string;
  name?: string;
}) {
  const businessName = args.profile.business_name?.trim();
  if (!businessName) return null;
  const description =
    args.profile.business_description ||
    args.profile.about_text ||
    undefined;
  return {
    "@type": "Service",
    "@id": args.id,
    name: args.name || `Airport parking — ${businessName}`,
    description,
    serviceType: "Airport parking",
    provider: { "@id": args.providerId },
    areaServed: buildAreaServed(args.profile.airports),
    potentialAction: buildReserveAction(args.bookUrl),
  };
}

export function buildWebPageJsonLd(args: {
  name: string;
  url: string;
  description?: string;
  isPartOfUrl?: string;
  id?: string;
  websiteId?: string;
  publisherId?: string;
  aboutId?: string;
  mainEntityId?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    ...(args.id ? { "@id": args.id } : {}),
    name: args.name,
    url: args.url,
    description: args.description,
    isPartOf: args.websiteId
      ? { "@id": args.websiteId }
      : args.isPartOfUrl
        ? { "@type": "WebSite", url: args.isPartOfUrl }
        : undefined,
    publisher: args.publisherId ? { "@id": args.publisherId } : undefined,
    about: args.aboutId ? { "@id": args.aboutId } : undefined,
    mainEntity: args.mainEntityId ? { "@id": args.mainEntityId } : undefined,
  };
}

export function buildPlaceJsonLd(args: {
  profile: JsonLdProfile;
  id: string;
  url: string;
  mapsUrl?: string | null;
}) {
  const name = args.profile.business_name;
  if (!name) return null;
  const geo = geoCoordinates(args.profile);
  const address = postalAddress(args.profile);
  if (!geo && !address) return null;
  return {
    "@type": "Place",
    "@id": args.id,
    name,
    url: args.url,
    address,
    geo,
    hasMap: args.mapsUrl?.trim() || undefined,
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

function withoutContext<T extends Record<string, unknown>>(
  node: T
): Omit<T, "@context"> {
  const { ["@context"]: _c, ...rest } = node;
  return rest;
}

/**
 * Builds linked schema.org entities as one @graph script (+ optional FAQ script).
 * Never invents airports, ratings, prices (Offers), or review text.
 */
export function collectPageJsonLdScripts(args: {
  page: SitePageRow | null;
  settings: SiteSeoSettings | null;
  profile: JsonLdProfile | null;
  siteUrl: string | null;
  pageUrl: string | null;
  includeLocalBusiness?: boolean;
  includeService?: boolean;
  includePlace?: boolean;
  includeFaq?: boolean;
  breadcrumbs?: Array<{ name: string; url: string }>;
}): string[] {
  if (!args.siteUrl || !args.pageUrl || !args.profile) return [];

  const scripts: string[] = [];
  const ids = buildEntityIds(args.siteUrl, args.pageUrl);
  const bookUrl = buildBookUrl(args.siteUrl);
  const mapsUrl = resolveMapsUrlFromSettings(args.settings);
  const alternateSiteName = args.settings?.alternative_site_name || null;
  const siteName =
    args.settings?.website_name ||
    args.profile.business_name ||
    "Airport Parking";

  // LocalBusiness is opt-in (home/contact); Service defaults on for marketing pages
  const includeLb = args.includeLocalBusiness === true;
  const includeService = args.includeService !== false;
  const includePlace = Boolean(args.includePlace);
  const includeFaq = args.includeFaq !== false;

  const graph: Record<string, unknown>[] = [];

  const website = buildWebsiteJsonLd({
    name: siteName,
    url: args.siteUrl,
    id: ids.website,
    publisherId: ids.organization,
    bookUrl,
  });
  graph.push(withoutContext(website as Record<string, unknown>));

  const org = buildOrganizationJsonLd({
    profile: args.profile,
    url: args.siteUrl,
    logo: args.settings?.logo_url,
    id: ids.organization,
    alternateSiteName,
    mapsUrl,
  });
  if (org) graph.push(withoutContext(org as Record<string, unknown>));

  let aboutId: string | undefined;
  let mainEntityId: string | undefined;

  if (includeLb) {
    const lb = buildLocalBusinessJsonLd({
      profile: args.profile,
      url: args.siteUrl,
      schemaType: args.settings?.schema_business_type,
      logo: args.settings?.logo_url,
      id: ids.localBusiness,
      organizationId: ids.organization,
      mapsUrl,
      alternateSiteName,
    });
    if (lb) {
      graph.push(withoutContext(lb as Record<string, unknown>));
      aboutId = ids.localBusiness;
      mainEntityId = ids.localBusiness;
    }
  }

  if (includeService) {
    const service = buildParkingServiceJsonLd({
      profile: args.profile,
      id: ids.service,
      providerId: includeLb ? ids.localBusiness : ids.organization,
      bookUrl,
    });
    if (service) {
      graph.push(service as Record<string, unknown>);
      mainEntityId = ids.service;
      if (!aboutId) aboutId = ids.service;
    }
  }

  if (includePlace) {
    const place = buildPlaceJsonLd({
      profile: args.profile,
      id: ids.place,
      url: args.siteUrl,
      mapsUrl,
    });
    if (place) graph.push(place as Record<string, unknown>);
  }

  const webpage = buildWebPageJsonLd({
    name: args.page?.seo_title || args.page?.title || siteName,
    url: args.pageUrl,
    description: args.page?.meta_description || undefined,
    id: ids.webpage,
    websiteId: ids.website,
    publisherId: ids.organization,
    aboutId,
    mainEntityId,
  });
  graph.push(withoutContext(webpage as Record<string, unknown>));

  if (args.breadcrumbs?.length) {
    const bc = buildBreadcrumbJsonLd(args.breadcrumbs);
    if (bc) graph.push(withoutContext(bc as Record<string, unknown>));
  }

  scripts.push(
    safeJsonLd({
      "@context": "https://schema.org",
      "@graph": graph,
    })
  );

  if (includeFaq) {
    const blocks = parseContentBlocks(args.page?.content_json);
    const faqs = faqItemsWithAnswers(blocks, args.profile.faq);
    const faqLd = buildFaqPageJsonLd(faqs);
    if (faqLd) scripts.push(safeJsonLd(faqLd));
  }

  return scripts;
}
