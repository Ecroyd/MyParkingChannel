import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { ensureSiteSeoSettings, ensureSystemPages } from "./load-site-seo";

export type SeoAdminContext = {
  userId: string;
  role: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  siteId: string;
  siteSlug: string;
  sitePrimaryDomain: string | null;
};

/**
 * Resolve tenant + site for SEO admin from authenticated user context.
 * Never trusts a browser-supplied tenant_id.
 */
export async function requireSeoAdminContext(): Promise<
  | { ok: true; ctx: SeoAdminContext }
  | { ok: false; status: number; error: string }
> {
  const current = await getCurrentTenantContext();
  if (!current) {
    return { ok: false, status: 401, error: "Not authenticated or no tenant membership" };
  }

  const adminRoles = new Set(["owner", "admin", "manager"]);
  if (!adminRoles.has(String(current.role))) {
    return { ok: false, status: 403, error: "Insufficient role for SEO administration" };
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("id, slug, name")
    .eq("id", current.tenantId)
    .maybeSingle();

  if (!tenant) {
    return { ok: false, status: 404, error: "Tenant not found" };
  }

  let { data: site } = await admin
    .from("sites")
    .select("id, slug, primary_domain, tenant_id")
    .eq("tenant_id", tenant.id)
    .eq("slug", tenant.slug)
    .maybeSingle();

  if (!site) {
    const { data: anySite } = await admin
      .from("sites")
      .select("id, slug, primary_domain, tenant_id")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    site = anySite;
  }

  if (!site) {
    const { data: created, error } = await admin
      .from("sites")
      .insert({
        tenant_id: tenant.id,
        slug: tenant.slug,
        status: "ready",
        template: "default",
      })
      .select("id, slug, primary_domain, tenant_id")
      .single();
    if (error || !created) {
      return { ok: false, status: 500, error: "Could not resolve site for tenant" };
    }
    site = created;
  }

  await ensureSystemPages(site.id);
  await ensureSiteSeoSettings({
    siteId: site.id,
    tenantId: tenant.id,
    defaults: {
      website_name: tenant.name,
    } as never,
  });

  return {
    ok: true,
    ctx: {
      userId: current.userId,
      role: current.role,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      siteId: site.id,
      siteSlug: site.slug,
      sitePrimaryDomain: site.primary_domain,
    },
  };
}

/** Assert a site_id belongs to the authenticated tenant. */
export function assertSiteBelongsToTenant(
  siteId: string,
  ctx: SeoAdminContext
): boolean {
  return siteId === ctx.siteId;
}
