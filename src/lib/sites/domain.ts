export function baseSitesURL() {
  // Use production domain when NODE_ENV is production, otherwise use the configured domain
  const isProduction = process.env.NODE_ENV === 'production';
  const raw = isProduction 
    ? 'https://myparkingchannel.app'
    : (process.env.NEXT_PUBLIC_SITES_BASE_DOMAIN || 'http://localhost:3002');
  
  try { return new URL(raw); } catch { throw new Error(`Bad NEXT_PUBLIC_SITES_BASE_DOMAIN: ${raw}`); }
}

/** e.g. slug -> https://slug.myparkingchannel.app  |  http://slug.localhost:3002 */
export function siteUrlForTenantSlug(slug: string, path = "/") {
  const base = baseSitesURL();
  const host = `${slug}.${base.host}`;
  return `${base.protocol}//${host}${path}`;
}

/** Return slug from a hostname iff it matches *.baseHost, else null */
export function slugFromHost(host: string): string | null {
  const base = baseSitesURL();
  const baseHost = base.host;                       // e.g. "localhost:3002" or "myparkingchannel.app"
  if (host === baseHost) return null;
  if (!host.endsWith("." + baseHost)) return null;
  return host.slice(0, -(baseHost.length + 1));     // leftmost label(s)
}

/** Return just the domain (hostname) for a tenant slug, e.g. "slug.myparkingchannel.app" */
export function siteDomainForTenantSlug(slug: string): string {
  const base = baseSitesURL();
  return `${slug}.${base.host}`;
}
