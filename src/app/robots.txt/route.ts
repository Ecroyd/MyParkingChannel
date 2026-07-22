import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeHostname, isPlatformHost } from "@/lib/seo/canonical";
import { buildRobotsTxt, buildSitemapXml } from "@/lib/seo/sitemap-robots";
import type { SitePageRow, SiteSeoSettings, TenantDomainRow } from "@/lib/seo/types";

/**
 * Root robots.txt / sitemap.xml for custom domains.
 * Middleware excludes these paths from rewrites, so we resolve tenant by Host here.
 */
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function resolveSiteByHost(rawHost: string | null) {
  const host = normalizeHostname(rawHost);
  if (!host || isPlatformHost(rawHost)) return null;

  const sb = adminClient();
  const { data: domainRow } = await sb
    .from("tenant_domains")
    .select("tenant_id, tenants!inner(slug)")
    .eq("domain", host)
    .maybeSingle();

  const slug =
    (domainRow as { tenants?: { slug?: string } } | null)?.tenants?.slug ?? null;
  if (!slug) return null;

  const { data: site } = await sb
    .from("sites")
    .select("id, primary_domain, tenant_id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!site) return null;

  const [{ data: settings }, { data: pages }, { data: domains }] = await Promise.all([
    sb.from("site_seo_settings").select("*").eq("site_id", site.id).maybeSingle(),
    sb.from("site_pages").select("*").eq("site_id", site.id),
    sb
      .from("tenant_domains")
      .select("id, domain, is_primary, verified, tenant_id")
      .eq("tenant_id", site.tenant_id),
  ]);

  return {
    site,
    settings: settings as SiteSeoSettings | null,
    pages: (pages as SitePageRow[]) ?? [],
    domains: (domains as TenantDomainRow[]) ?? [],
  };
}

export async function GET(req: NextRequest) {
  const resolved = await resolveSiteByHost(req.headers.get("host"));
  if (!resolved) {
    // Platform host fallback
    return new NextResponse(
      `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n`,
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const body = buildRobotsTxt({
    settings: resolved.settings,
    domains: resolved.domains,
    sitePrimaryDomain: resolved.site.primary_domain,
    requestHost: req.headers.get("host"),
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Site-Id": resolved.site.id,
    },
  });
}
