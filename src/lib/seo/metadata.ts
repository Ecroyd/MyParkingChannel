import type { Metadata } from "next";
import { resolveCanonicalUrl, isUnsafeCanonicalHost, buildAbsoluteUrl } from "./canonical";
import { resolveRobots, hasIndexableBookingQuery } from "./indexing";
import type { DomainCandidate } from "./canonical";
import type { SitePageRow, SiteSeoSettings } from "./types";

export type ProfileLike = {
  business_name?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  site_title?: string | null;
  site_description?: string | null;
  business_description?: string | null;
  about_text?: string | null;
  logo_url?: string | null;
  short_tagline?: string | null;
};

export function resolvePageTitle(args: {
  page?: Pick<SitePageRow, "seo_title" | "title" | "h1"> | null;
  settings?: Pick<SiteSeoSettings, "website_name" | "default_title_template"> | null;
  profile?: ProfileLike | null;
}): string {
  const pageSeo = args.page?.seo_title?.trim();
  if (pageSeo) return pageSeo;

  const pageTitle = args.page?.title?.trim() || args.page?.h1?.trim();
  const siteName =
    args.settings?.website_name?.trim() ||
    args.profile?.business_name?.trim() ||
    args.profile?.site_title?.trim() ||
    "Airport Parking";

  if (args.settings?.default_title_template?.includes("{page}")) {
    const base = pageTitle || siteName;
    return args.settings.default_title_template
      .replace("{page}", base)
      .replace("{site}", siteName);
  }

  if (pageTitle && pageTitle !== siteName) {
    return `${pageTitle} | ${siteName}`;
  }

  return (
    args.profile?.meta_title?.trim() ||
    args.settings?.default_title_template?.replace("{site}", siteName)?.replace("{page}", siteName) ||
    siteName
  );
}

export function resolvePageDescription(args: {
  page?: Pick<SitePageRow, "meta_description" | "excerpt"> | null;
  settings?: Pick<SiteSeoSettings, "default_meta_description"> | null;
  profile?: ProfileLike | null;
}): string {
  return (
    args.page?.meta_description?.trim() ||
    args.page?.excerpt?.trim() ||
    args.settings?.default_meta_description?.trim() ||
    args.profile?.meta_description?.trim() ||
    args.profile?.site_description?.trim() ||
    args.profile?.business_description?.trim() ||
    args.profile?.about_text?.trim() ||
    args.profile?.short_tagline?.trim() ||
    "Secure airport parking."
  );
}

export function buildTenantPageMetadata(args: {
  page: SitePageRow | null;
  settings: SiteSeoSettings | null;
  profile: ProfileLike | null;
  domains: DomainCandidate[];
  pagePath: string;
  requestHost?: string | null;
  searchParams?: URLSearchParams | Record<string, string | string[] | undefined> | null;
  sitePrimaryDomain?: string | null;
  verification?: {
    google?: string | null;
    bing?: string | null;
  };
}): Metadata {
  const title = resolvePageTitle({
    page: args.page,
    settings: args.settings,
    profile: args.profile,
  });
  const description = resolvePageDescription({
    page: args.page,
    settings: args.settings,
    profile: args.profile,
  });

  const robots = resolveRobots({
    page: args.page,
    settings: args.settings,
    requestHost: args.requestHost,
    hasBookingQuery: hasIndexableBookingQuery(args.searchParams),
  });

  const canonical = resolveCanonicalUrl({
    domains: args.domains,
    pagePath: args.page?.canonical_path || args.pagePath,
    pageCanonicalPath: args.page?.canonical_path,
    canonicalOverride: args.settings?.canonical_domain_override,
    sitePrimaryDomain: args.sitePrimaryDomain,
    requestHost: args.requestHost,
  });

  const ogTitle = args.page?.og_title?.trim() || title;
  const ogDescription = args.page?.og_description?.trim() || description;
  const ogImage =
    args.page?.og_image_url ||
    args.settings?.default_og_image_url ||
    args.settings?.logo_url ||
    args.profile?.logo_url ||
    undefined;

  const metadataBase = canonical.host
    ? new URL(`https://${canonical.host}`)
    : undefined;

  const meta: Metadata = {
    title,
    description,
    metadataBase,
    robots: {
      index: robots.index,
      follow: robots.follow,
      googleBot: {
        index: robots.index,
        follow: robots.follow,
      },
    },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical.url ?? undefined,
      siteName:
        args.settings?.website_name ||
        args.profile?.business_name ||
        undefined,
      type: "website",
      images: ogImage ? [{ url: ogImage }] : undefined,
      locale: args.settings?.primary_language?.replace("-", "_") || "en_GB",
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: ogTitle,
      description: ogDescription,
      images: ogImage ? [ogImage] : undefined,
    },
  };

  if (canonical.url && !isUnsafeCanonicalHost(canonical.host)) {
    meta.alternates = { canonical: canonical.url };
  }

  const other: Record<string, string> = {};
  if (args.verification?.google || args.settings?.google_search_console_verification) {
    meta.verification = {
      ...meta.verification,
      google:
        args.verification?.google ||
        args.settings?.google_search_console_verification ||
        undefined,
    };
  }
  if (args.settings?.bing_verification) {
    other["msvalidate.01"] = args.settings.bing_verification;
  }
  if (Object.keys(other).length) {
    meta.other = other;
  }

  return meta;
}

export function absolutePublicUrl(
  host: string | null,
  path: string
): string | null {
  return buildAbsoluteUrl(host, path);
}
