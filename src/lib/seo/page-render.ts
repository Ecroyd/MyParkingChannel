import { headers } from "next/headers";
import type { Metadata } from "next";
import {
  getSiteSeoBundleBySlug,
  findPageByPath,
  findPageByKey,
  buildTenantPageMetadata,
  collectPageJsonLdScripts,
  resolvePrimaryCanonicalHost,
  buildAbsoluteUrl,
} from "@/lib/seo";
import type { JsonLdProfile } from "@/lib/seo/json-ld";

export async function generateTenantPageMetadata(args: {
  slug: string;
  path: string;
  pageKey?: string;
  searchParams?: Record<string, string | string[] | undefined>;
}): Promise<Metadata> {
  const bundle = await getSiteSeoBundleBySlug(args.slug);
  if (!bundle) {
    return { title: "Airport Parking", robots: { index: false, follow: false } };
  }

  const headerStore = await headers();
  const requestHost = headerStore.get("host");

  const page =
    (args.pageKey ? findPageByKey(bundle.pages, args.pageKey) : null) ||
    findPageByPath(bundle.pages, args.path);

  return buildTenantPageMetadata({
    page,
    settings: bundle.settings,
    profile: bundle.profile as never,
    domains: bundle.domains,
    pagePath: args.path,
    requestHost,
    searchParams: args.searchParams,
    sitePrimaryDomain: bundle.sitePrimaryDomain,
  });
}

export async function getTenantPageRenderData(args: {
  slug: string;
  path: string;
  pageKey?: string;
}) {
  const bundle = await getSiteSeoBundleBySlug(args.slug);
  if (!bundle) return null;

  const headerStore = await headers();
  const requestHost = headerStore.get("host");

  const page =
    (args.pageKey ? findPageByKey(bundle.pages, args.pageKey) : null) ||
    findPageByPath(bundle.pages, args.path);

  const host = resolvePrimaryCanonicalHost(bundle.domains, {
    canonicalOverride: bundle.settings?.canonical_domain_override,
    sitePrimaryDomain: bundle.sitePrimaryDomain,
  });

  const siteUrl = host ? buildAbsoluteUrl(host, "/") : null;
  const pageUrl = host ? buildAbsoluteUrl(host, args.path) : null;

  const jsonLdScripts = collectPageJsonLdScripts({
    page,
    settings: bundle.settings,
    profile: bundle.profile as JsonLdProfile | null,
    siteUrl,
    pageUrl,
    includeLocalBusiness: args.path === "/" || args.pageKey === "home",
    breadcrumbs:
      args.path === "/"
        ? undefined
        : [
            { name: "Home", url: siteUrl || "/" },
            {
              name: String(page?.nav_label || page?.title || args.path),
              url: pageUrl || args.path,
            },
          ],
  });

  return {
    bundle,
    page,
    requestHost,
    host,
    siteUrl,
    pageUrl,
    jsonLdScripts,
    profile: bundle.profile,
    branding: bundle.branding,
  };
}
