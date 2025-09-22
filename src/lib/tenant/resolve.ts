import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * Extract a tenant "hint" (slug) from host, path, or query.
 * Priority:
 * 1) x-tenant-slug header (set by middleware)
 * 2) ?tenant=<slug> query param (fallback during localhost dev)
 * 3) Host-based domain mapping (e.g., flyparks.myparkingchannel.app)
 */
function extractTenantSlugFromUrl(u: URL): string | null {
  // 1) query param ?tenant=slug (useful on localhost)
  const qp = u.searchParams.get('tenant');
  if (qp) return qp;

  // 2) subdomain mapping (e.g., org_slug.baseDomain)
  const host = u.hostname.toLowerCase(); // e.g., localhost or abc.myparkingchannel.app
  const base = (process.env.NEXT_PUBLIC_APP_BASE_DOMAIN || '').toLowerCase(); // e.g., myparkingchannel.app
  if (base && host.endsWith(base)) {
    const sub = host.replace(new RegExp(`\\.?${base}$`, 'i'), '');
    const subClean = sub.replace(/:\d+$/, '').replace(/^\./, '');
    if (subClean) return subClean;
  }

  return null;
}

/**
 * Resolve tenant id using:
 * - x-tenant-id header (if middleware already looked it up)
 * - x-tenant-slug header
 * - URL based extraction + DB lookup
 */
export async function resolveTenantIdOrThrow(u?: URL): Promise<string> {
  const h = headers();

  // Middleware can set these to short-circuit lookups.
  const hdrId = h.get('x-tenant-id');
  if (hdrId) return hdrId;

  const hdrSlug = h.get('x-tenant-slug');
  if (hdrSlug) {
    const t = await findTenantBySlug(hdrSlug);
    if (!t) throw new Error(`Unknown tenant slug from header: ${hdrSlug}`);
    return t.id;
  }

  // If URL not provided (server component), recreate from headers
  let url = u;
  if (!url) {
    const host = h.get('host') ?? 'localhost:3000';
    const proto = h.get('x-forwarded-proto') ?? 'http';
    const path = h.get('x-invoke-path') || '/';
    url = new URL(`${proto}://${host}${path}`);
  }

  const slug = extractTenantSlugFromUrl(url);
  if (slug) {
    const t = await findTenantBySlug(slug);
    if (!t) throw new Error(`Unknown tenant slug: ${slug}`);
    return t.id;
  }

  // Domain mapping fallback (when a full custom domain points to a tenant)
  const host = (url?.hostname ?? '').toLowerCase();
  if (host) {
    const t = await findTenantByDomain(host);
    if (t) return t.id;
  }

  throw new Error('Tenant not resolved. Add ?tenant=<slug> in dev, or configure domain mapping.');
}

async function findTenantBySlug(slug: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('tenants')
    .select('id, slug')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as { id: string; slug: string } | null;
}

async function findTenantByDomain(domain: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('tenant_domains')
    .select('tenant_id, domain')
    .eq('domain', domain)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return { id: (data as any).tenant_id as string };
}
