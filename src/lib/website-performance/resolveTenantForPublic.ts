import { createAdminClient } from "@/lib/supabase/admin";

const PLATFORM_HOSTS = new Set([
  "myparkingchannel.app",
  "www.myparkingchannel.app",
  "localhost",
  "127.0.0.1",
]);

function normalizeHost(rawHost: string | null | undefined): string {
  if (!rawHost) return "";
  const hostOnly = rawHost.split(":")[0]?.toLowerCase() ?? "";
  return hostOnly.startsWith("www.") ? hostOnly.slice(4) : hostOnly;
}

/**
 * Resolve tenant for public analytics ingest.
 * Never trusts a client-supplied tenant_id.
 * Uses Host → domain/subdomain, then optional slug hint looked up server-side.
 */
export async function resolveTenantForPublicAnalytics(opts: {
  host: string | null;
  /** Optional slug hint (e.g. from public site). Looked up server-side — not trusted as an id. */
  tenantSlug?: string | null;
}): Promise<{ tenantId: string; tenantSlug: string } | null> {
  const admin = createAdminClient();
  const normalizedHost = normalizeHost(opts.host);
  const baseHost = "myparkingchannel.app";

  if (normalizedHost && !PLATFORM_HOSTS.has(normalizedHost) && !normalizedHost.endsWith(".vercel.app")) {
    if (normalizedHost.endsWith(`.${baseHost}`)) {
      const slug = normalizedHost.slice(0, -(baseHost.length + 1));
      if (slug) {
        const { data } = await admin
          .from("tenants")
          .select("id, slug")
          .eq("slug", slug)
          .maybeSingle();
        if (data?.id) return { tenantId: data.id, tenantSlug: data.slug };
      }
    }

    const { data: domainRow } = await admin
      .from("tenant_domains")
      .select("tenant_id, tenants!inner(id, slug)")
      .eq("domain", normalizedHost)
      .maybeSingle();

    const tenant = (domainRow as { tenants?: { id: string; slug: string } | { id: string; slug: string }[] } | null)
      ?.tenants;
    const t = Array.isArray(tenant) ? tenant[0] : tenant;
    if (t?.id) return { tenantId: t.id, tenantSlug: t.slug };
  }

  const slug = opts.tenantSlug?.trim().toLowerCase();
  if (slug && /^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
    const { data } = await admin
      .from("tenants")
      .select("id, slug")
      .eq("slug", slug)
      .maybeSingle();
    if (data?.id) return { tenantId: data.id, tenantSlug: data.slug };
  }

  return null;
}
