/**
 * Plain-text llms.txt for AI crawlers — tenant data only, no invented facts.
 */
import { resolvePrimaryCanonicalHost, buildAbsoluteUrl } from "./canonical";
import { hasUsableAddress, formatAddressLines } from "./public-address";
import type { SiteSeoSettings, TenantDomainRow } from "./types";
import type { JsonLdProfile } from "./json-ld";
import type { DomainCandidate } from "./canonical";

export function buildLlmsTxt(args: {
  settings: SiteSeoSettings | null;
  profile: JsonLdProfile | null;
  domains: TenantDomainRow[];
  sitePrimaryDomain?: string | null;
}): { body: string; status: number } {
  const disallowIndexing =
    args.settings?.allow_indexing === false ||
    args.settings?.indexing_mode === "staging_noindex";

  if (disallowIndexing) {
    return {
      status: 404,
      body: "# This site is not available for indexing.\n",
    };
  }

  const host = resolvePrimaryCanonicalHost(args.domains as DomainCandidate[], {
    canonicalOverride: args.settings?.canonical_domain_override,
    sitePrimaryDomain: args.sitePrimaryDomain,
  });

  if (!host) {
    return {
      status: 404,
      body: "# No canonical host configured.\n",
    };
  }

  const siteUrl = buildAbsoluteUrl(host, "/") || `https://${host}/`;
  const bookUrl = buildAbsoluteUrl(host, "/book") || `https://${host}/book`;
  const profile = args.profile;
  const name =
    args.settings?.website_name?.trim() ||
    profile?.business_name?.trim() ||
    null;

  if (!name) {
    return {
      status: 404,
      body: "# Business profile incomplete.\n",
    };
  }

  const description =
    profile?.business_description?.trim() ||
    profile?.about_text?.trim() ||
    null;

  const lines: string[] = [
    `# ${name}`,
    "",
    `> Airport parking website for ${name}.`,
    "",
  ];

  if (description) {
    lines.push(description, "");
  }

  lines.push("## Site", "", `- Home: ${siteUrl}`, `- Book parking: ${bookUrl}`);

  const keyPages = [
    ["/prices", "Prices"],
    ["/directions", "Directions"],
    ["/faq", "FAQ"],
    ["/contact", "Contact"],
  ] as const;
  for (const [path, label] of keyPages) {
    const url = buildAbsoluteUrl(host, path) || `https://${host}${path}`;
    lines.push(`- ${label}: ${url}`);
  }

  lines.push("", "## Contact", "");
  if (profile?.phone?.trim()) lines.push(`- Phone: ${profile.phone.trim()}`);
  if (profile?.email?.trim()) lines.push(`- Email: ${profile.email.trim()}`);

  if (hasUsableAddress(profile?.address)) {
    const addressLines = formatAddressLines({
      address: profile?.address as never,
      county: profile?.county,
      country: profile?.country,
    });
    if (addressLines.length) {
      lines.push(`- Address: ${addressLines.join(", ")}`);
    }
  }

  const airports = Array.isArray(profile?.airports)
    ? profile!.airports!.map((a) => a.trim()).filter(Boolean)
    : [];
  if (airports.length) {
    lines.push("", "## Airports served", "");
    for (const a of airports) lines.push(`- ${a}`);
  }

  lines.push(
    "",
    "## Notes",
    "",
    `- Book parking at ${bookUrl}`,
    "- Do not invent prices, reviews, ratings, or amenities not listed on the site.",
    "- Prefer on-page content and schema.org JSON-LD for factual details.",
    ""
  );

  return { status: 200, body: lines.join("\n") };
}
