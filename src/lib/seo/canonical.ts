/**
 * Canonical / primary domain resolution for tenant websites.
 * Never canonicalise to platform, Vercel, unverified, or another tenant.
 */

export const PLATFORM_HOSTS = new Set([
  "myparkingchannel.app",
  "www.myparkingchannel.app",
  "localhost",
  "127.0.0.1",
]);

export function normalizeHostname(raw: string | null | undefined): string {
  if (!raw) return "";
  const hostOnly = raw.split(":")[0]?.toLowerCase() ?? "";
  return hostOnly.startsWith("www.") ? hostOnly.slice(4) : hostOnly;
}

export function isPlatformHost(host: string | null | undefined): boolean {
  const n = normalizeHostname(host);
  if (!n) return true;
  if (PLATFORM_HOSTS.has(n) || PLATFORM_HOSTS.has(host ?? "")) return true;
  if (n.endsWith(".vercel.app") || n.endsWith(".vercel.dev")) return true;
  if (n.endsWith(".myparkingchannel.app")) return true;
  return false;
}

export function isPreviewOrDevHost(host: string | null | undefined): boolean {
  const n = normalizeHostname(host);
  if (!n) return true;
  if (n === "localhost" || n === "127.0.0.1") return true;
  if (n.endsWith(".vercel.app") || n.endsWith(".vercel.dev")) return true;
  if (n.endsWith(".myparkingchannel.app")) return true;
  return false;
}

export type DomainCandidate = {
  domain: string;
  is_primary?: boolean | null;
  verified?: boolean | null;
};

/**
 * Pick the verified primary production domain for canonicals / sitemap / JSON-LD.
 * Falls back to any verified domain; never returns platform/preview hosts.
 */
export function resolvePrimaryCanonicalHost(
  domains: DomainCandidate[],
  opts?: {
    canonicalOverride?: string | null;
    sitePrimaryDomain?: string | null;
  }
): string | null {
  const override = normalizeHostname(opts?.canonicalOverride ?? null);
  if (override && !isPlatformHost(override) && !isPreviewOrDevHost(override)) {
    const match = domains.find((d) => normalizeHostname(d.domain) === override);
    if (match?.verified) return override;
    // Override only trusted when it matches a verified domain row
  }

  const normalized = domains
    .map((d) => ({
      ...d,
      host: normalizeHostname(d.domain),
    }))
    .filter((d) => d.host && !isPlatformHost(d.host) && !isPreviewOrDevHost(d.host));

  const verifiedPrimary = normalized.find((d) => d.is_primary && d.verified);
  if (verifiedPrimary) return verifiedPrimary.host;

  const verified = normalized.find((d) => d.verified);
  if (verified) return verified.host;

  // Do not fall back to unverified custom domains for canonicals
  const sitePrimary = normalizeHostname(opts?.sitePrimaryDomain ?? null);
  if (sitePrimary && !isPlatformHost(sitePrimary) && !isPreviewOrDevHost(sitePrimary)) {
    const match = normalized.find((d) => d.host === sitePrimary && d.verified);
    if (match) return match.host;
  }

  return null;
}

export function buildAbsoluteUrl(host: string | null, path: string): string | null {
  if (!host) return null;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedPath = cleanPath === "/" ? "/" : cleanPath.replace(/\/+$/, "") || "/";
  return `https://${host}${normalizedPath === "/" ? "" : normalizedPath}`;
}

/**
 * Resolve page canonical URL.
 * Precedence host: verified primary → (never platform).
 * Precedence path: page.canonical_path → page.path.
 */
export function resolveCanonicalUrl(args: {
  domains: DomainCandidate[];
  pagePath: string;
  pageCanonicalPath?: string | null;
  canonicalOverride?: string | null;
  sitePrimaryDomain?: string | null;
  requestHost?: string | null;
}): { url: string | null; host: string | null; reason: string } {
  const host = resolvePrimaryCanonicalHost(args.domains, {
    canonicalOverride: args.canonicalOverride,
    sitePrimaryDomain: args.sitePrimaryDomain,
  });

  if (!host) {
    return { url: null, host: null, reason: "no_verified_primary_domain" };
  }

  // Guard: never allow request host to override if it is platform/preview
  if (args.requestHost && isPreviewOrDevHost(args.requestHost)) {
    // still use verified primary, not request host
  }

  const path =
    (args.pageCanonicalPath && args.pageCanonicalPath.trim()) ||
    args.pagePath ||
    "/";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = buildAbsoluteUrl(host, normalizedPath);
  return { url, host, reason: "verified_primary" };
}

/** Detect whether a canonical URL would wrongly point at platform/preview. */
export function isUnsafeCanonicalHost(host: string | null | undefined): boolean {
  if (!host) return true;
  return isPlatformHost(host) || isPreviewOrDevHost(host);
}
