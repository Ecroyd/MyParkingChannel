import { resolvePrimaryCanonicalHost, buildAbsoluteUrl } from "./canonical";
import { FORCE_NOINDEX_PAGE_KEYS } from "./types";
import type { SitePageRow, SiteSeoSettings, TenantDomainRow } from "./types";
import type { DomainCandidate } from "./canonical";

export function buildSitemapXml(args: {
  pages: SitePageRow[];
  settings: SiteSeoSettings | null;
  domains: TenantDomainRow[];
  sitePrimaryDomain?: string | null;
}): string {
  const host = resolvePrimaryCanonicalHost(args.domains as DomainCandidate[], {
    canonicalOverride: args.settings?.canonical_domain_override,
    sitePrimaryDomain: args.sitePrimaryDomain,
  });

  if (!host) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
  }

  const allowIndexing =
    (args.settings?.allow_indexing ?? true) &&
    args.settings?.indexing_mode !== "staging_noindex";

  const urls = args.pages.filter((p) => {
    if (!allowIndexing) return false;
    if (p.status !== "published") return false;
    if (p.page_key && FORCE_NOINDEX_PAGE_KEYS.has(p.page_key)) return false;
    if (p.robots_index === false) return false;
    if (p.robots_index == null && args.settings?.default_robots_index === false) return false;
    return true;
  });

  const body = urls
    .map((p) => {
      const loc = buildAbsoluteUrl(host, p.path) || `https://${host}${p.path === "/" ? "" : p.path}`;
      const lastmod = (p.updated_at || p.published_at || new Date().toISOString()).slice(0, 10);
      const priority =
        p.path === "/" ? "1.0" : p.path === "/book" ? "0.9" : "0.7";
      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}

export function buildRobotsTxt(args: {
  settings: SiteSeoSettings | null;
  domains: TenantDomainRow[];
  sitePrimaryDomain?: string | null;
  requestHost?: string | null;
}): string {
  const host = resolvePrimaryCanonicalHost(args.domains as DomainCandidate[], {
    canonicalOverride: args.settings?.canonical_domain_override,
    sitePrimaryDomain: args.sitePrimaryDomain,
  });

  const sitemapHost = host;
  const disallowIndexing =
    args.settings?.allow_indexing === false ||
    args.settings?.indexing_mode === "staging_noindex";

  const lines = [
    "User-agent: *",
    disallowIndexing ? "Disallow: /" : "Allow: /",
    "",
    "Disallow: /admin/",
    "Disallow: /api/",
    "Disallow: /_next/",
    "Disallow: /widget/",
    "Disallow: /manage-booking",
    "Disallow: /manage",
    "Disallow: /checkout",
    "Disallow: /payment",
    "Disallow: /success",
    "Disallow: /account",
    "",
  ];

  if (sitemapHost && !disallowIndexing) {
    lines.push(`Sitemap: https://${sitemapHost}/sitemap.xml`);
  }

  return lines.join("\n") + "\n";
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
