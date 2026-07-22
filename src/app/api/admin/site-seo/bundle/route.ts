import { NextResponse } from "next/server";
import { requireSeoAdminContext } from "@/lib/seo/admin-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { runSeoHealthChecks, summarizeHealth } from "@/lib/seo/health";
import { resolvePrimaryCanonicalHost } from "@/lib/seo/canonical";
import type { SitePageRow, SiteRedirect, SiteSeoSettings, TenantDomainRow } from "@/lib/seo/types";

export async function GET() {
  const auth = await requireSeoAdminContext();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { ctx } = auth;
  const admin = createAdminClient();

  const [
    { data: settings },
    { data: pages },
    { data: redirects },
    { data: domains },
    { data: profile },
  ] = await Promise.all([
    admin.from("site_seo_settings").select("*").eq("site_id", ctx.siteId).maybeSingle(),
    admin.from("site_pages").select("*").eq("site_id", ctx.siteId).order("nav_order", { ascending: true }),
    admin.from("site_redirects").select("*").eq("site_id", ctx.siteId).order("old_path"),
    admin
      .from("tenant_domains")
      .select("id, domain, is_primary, verified, tenant_id")
      .eq("tenant_id", ctx.tenantId),
    admin.from("tenant_public_profile").select("*").eq("tenant_id", ctx.tenantId).maybeSingle(),
  ]);

  const health = summarizeHealth(
    runSeoHealthChecks({
      settings: settings as SiteSeoSettings | null,
      pages: (pages as SitePageRow[]) ?? [],
      redirects: (redirects as SiteRedirect[]) ?? [],
      domains: (domains as TenantDomainRow[]) ?? [],
      profile,
      sitePrimaryDomain: ctx.sitePrimaryDomain,
    })
  );

  const primaryHost = resolvePrimaryCanonicalHost((domains as TenantDomainRow[]) ?? [], {
    canonicalOverride: (settings as SiteSeoSettings | null)?.canonical_domain_override,
    sitePrimaryDomain: ctx.sitePrimaryDomain,
  });

  const indexingMode = (settings as SiteSeoSettings | null)?.indexing_mode ?? "live_indexable";
  const allowIndexing = (settings as SiteSeoSettings | null)?.allow_indexing ?? true;
  const indexingState =
    !allowIndexing || indexingMode === "staging_noindex"
      ? "noindex"
      : indexingMode === "canonical_to_existing"
        ? "canonical_to_existing"
        : primaryHost
          ? "indexable"
          : "blocked_no_domain";

  const previewUrl = primaryHost
    ? `https://${primaryHost}/`
    : `https://myparkingchannel.app/sites/${ctx.tenantSlug}?preview=1`;

  return NextResponse.json({
    success: true,
    context: {
      tenantId: ctx.tenantId,
      tenantSlug: ctx.tenantSlug,
      tenantName: ctx.tenantName,
      siteId: ctx.siteId,
      siteSlug: ctx.siteSlug,
      primaryDomain: primaryHost,
      sitePrimaryDomain: ctx.sitePrimaryDomain,
      indexingState,
      lastPublishedAt: (settings as SiteSeoSettings | null)?.last_published_at ?? null,
      previewUrl,
    },
    settings: settings ?? null,
    pages: pages ?? [],
    redirects: redirects ?? [],
    domains: domains ?? [],
    profile: profile ?? null,
    health,
  });
}
