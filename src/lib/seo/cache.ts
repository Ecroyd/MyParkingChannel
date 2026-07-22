import { revalidateTag } from "next/cache";

/** Cache tags are always scoped by site_id to prevent cross-tenant leakage. */
export function siteSeoCacheTag(siteId: string): string {
  return `site-seo:${siteId}`;
}

export function sitePagesCacheTag(siteId: string): string {
  return `site-pages:${siteId}`;
}

export function siteMetaCacheTag(siteId: string): string {
  return `site-meta:${siteId}`;
}

export function siteHostCacheTag(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return `site-host:${host}`;
}

export function siteSitemapCacheTag(siteId: string): string {
  return `site-sitemap:${siteId}`;
}

export function siteRobotsCacheTag(siteId: string): string {
  return `site-robots:${siteId}`;
}

export function siteRedirectsCacheTag(siteId: string): string {
  return `site-redirects:${siteId}`;
}

/** Invalidate only the affected tenant site caches. */
export function invalidateSiteSeoCaches(args: {
  siteId: string;
  tenantId?: string;
  hostnames?: string[];
}) {
  const tags = [
    siteSeoCacheTag(args.siteId),
    sitePagesCacheTag(args.siteId),
    siteMetaCacheTag(args.siteId),
    siteSitemapCacheTag(args.siteId),
    siteRobotsCacheTag(args.siteId),
    siteRedirectsCacheTag(args.siteId),
  ];
  if (args.tenantId) {
    tags.push(`tenant-site:${args.tenantId}`);
  }
  for (const host of args.hostnames ?? []) {
    tags.push(siteHostCacheTag(host));
  }
  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch {
      // revalidateTag may throw outside of a request context in tests
    }
  }
}
