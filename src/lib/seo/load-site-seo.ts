import { createAdminClient } from "@/lib/supabase/server-admin";
import { SYSTEM_PAGE_DEFAULTS, SYSTEM_PAGE_KEYS, type SitePageRow, type SiteSeoSettings, type SiteRedirect, type TenantDomainRow } from "./types";
import { unstable_cache } from "next/cache";
import {
  siteMetaCacheTag,
  sitePagesCacheTag,
  siteRedirectsCacheTag,
  siteSeoCacheTag,
} from "./cache";

export type TenantSiteSeoBundle = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  siteId: string;
  siteSlug: string;
  sitePrimaryDomain: string | null;
  settings: SiteSeoSettings | null;
  pages: SitePageRow[];
  redirects: SiteRedirect[];
  domains: TenantDomainRow[];
  profile: Record<string, unknown> | null;
  branding: Record<string, unknown> | null;
};

async function loadBundleBySiteId(siteId: string): Promise<TenantSiteSeoBundle | null> {
  const admin = createAdminClient();

  const { data: site } = await admin
    .from("sites")
    .select("id, tenant_id, slug, primary_domain, status")
    .eq("id", siteId)
    .maybeSingle();

  if (!site) return null;

  const { data: tenant } = await admin
    .from("tenants")
    .select("id, slug, name")
    .eq("id", site.tenant_id)
    .maybeSingle();

  if (!tenant) return null;

  const [
    { data: settings },
    { data: pages },
    { data: redirects },
    { data: domains },
    { data: profile },
    { data: branding },
  ] = await Promise.all([
    admin.from("site_seo_settings").select("*").eq("site_id", siteId).maybeSingle(),
    admin.from("site_pages").select("*").eq("site_id", siteId).order("nav_order", { ascending: true }),
    admin.from("site_redirects").select("*").eq("site_id", siteId).eq("active", true),
    admin
      .from("tenant_domains")
      .select("id, domain, is_primary, verified, tenant_id")
      .eq("tenant_id", site.tenant_id),
    admin.from("tenant_public_profile").select("*").eq("tenant_id", site.tenant_id).maybeSingle(),
    admin.from("tenant_branding").select("*").eq("tenant_id", site.tenant_id).maybeSingle(),
  ]);

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    siteId: site.id,
    siteSlug: site.slug,
    sitePrimaryDomain: site.primary_domain,
    settings: (settings as SiteSeoSettings) ?? null,
    pages: (pages as SitePageRow[]) ?? [],
    redirects: (redirects as SiteRedirect[]) ?? [],
    domains: (domains as TenantDomainRow[]) ?? [],
    profile: profile ?? null,
    branding: branding ?? null,
  };
}

export function getCachedSiteSeoBundle(siteId: string) {
  return unstable_cache(
    () => loadBundleBySiteId(siteId),
    [`site-seo-bundle-${siteId}`],
    {
      tags: [
        siteSeoCacheTag(siteId),
        sitePagesCacheTag(siteId),
        siteMetaCacheTag(siteId),
        siteRedirectsCacheTag(siteId),
      ],
      revalidate: 60,
    }
  )();
}

export async function getSiteSeoBundleBySlug(slug: string): Promise<TenantSiteSeoBundle | null> {
  const admin = createAdminClient();
  const { data: site } = await admin
    .from("sites")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (site?.id) {
    return getCachedSiteSeoBundle(site.id);
  }

  // Fallback: tenant slug → site by tenant_id
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return null;

  const { data: fallbackSite } = await admin
    .from("sites")
    .select("id")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fallbackSite?.id) return null;
  return getCachedSiteSeoBundle(fallbackSite.id);
}

export function findPageByPath(pages: SitePageRow[], path: string): SitePageRow | null {
  const normalized = path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;
  return pages.find((p) => p.path === normalized) ?? null;
}

export function findPageByKey(pages: SitePageRow[], key: string): SitePageRow | null {
  return pages.find((p) => p.page_key === key) ?? null;
}

/** Ensure system pages exist for a site (idempotent upsert by page_key). */
export async function ensureSystemPages(siteId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("site_pages")
    .select("page_key, path")
    .eq("site_id", siteId);

  const existingKeys = new Set((existing ?? []).map((p) => p.page_key).filter(Boolean));
  const existingPaths = new Set((existing ?? []).map((p) => p.path));

  const rows = SYSTEM_PAGE_KEYS.map((key) => {
    const def = SYSTEM_PAGE_DEFAULTS[key];
    if (existingKeys.has(key)) return null;
    if (existingPaths.has(def.path)) return null;
    return {
      site_id: siteId,
      page_key: key,
      path: def.path,
      title: def.title,
      content_md: "",
      content_json: [],
      h1: def.title,
      nav_label: def.navLabel,
      nav_order: def.navOrder,
      show_in_navigation: def.showInNav,
      robots_index: def.robotsIndex,
      robots_follow: true,
      status: "published",
      published_at: new Date().toISOString(),
    };
  }).filter(Boolean);

  if (rows.length) {
    await admin.from("site_pages").insert(rows);
  }
}

export async function ensureSiteSeoSettings(args: {
  siteId: string;
  tenantId: string;
  defaults?: Partial<SiteSeoSettings>;
}): Promise<SiteSeoSettings | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("site_seo_settings")
    .select("*")
    .eq("site_id", args.siteId)
    .maybeSingle();

  if (existing) return existing as SiteSeoSettings;

  const { data, error } = await admin
    .from("site_seo_settings")
    .insert({
      site_id: args.siteId,
      tenant_id: args.tenantId,
      ...args.defaults,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[seo] ensureSiteSeoSettings", error);
    return null;
  }
  return data as SiteSeoSettings;
}
