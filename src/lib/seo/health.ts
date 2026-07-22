import { parseContentBlocks, visibleTextLength, faqItemsWithAnswers } from "./content-blocks";
import { resolvePrimaryCanonicalHost, isUnsafeCanonicalHost, normalizeHostname } from "./canonical";
import { detectRedirectLoop, normalizeRedirectPath } from "./redirects";
import { FORCE_NOINDEX_PAGE_KEYS } from "./types";
import type {
  HealthCheck,
  SitePageRow,
  SiteRedirect,
  SiteSeoSettings,
  TenantDomainRow,
} from "./types";
import type { DomainCandidate } from "./canonical";
import { hasUsableAddress } from "./public-address";

export type HealthInput = {
  settings: SiteSeoSettings | null;
  pages: SitePageRow[];
  redirects: SiteRedirect[];
  domains: TenantDomainRow[];
  profile: {
    business_name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: Record<string, unknown> | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    faq?: unknown;
  } | null;
  sitePrimaryDomain?: string | null;
};

function hasAddress(profile: HealthInput["profile"]): boolean {
  return hasUsableAddress(profile?.address);
}

export function runSeoHealthChecks(input: HealthInput): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const domains = input.domains as DomainCandidate[];
  const primaryHost = resolvePrimaryCanonicalHost(domains, {
    canonicalOverride: input.settings?.canonical_domain_override,
    sitePrimaryDomain: input.sitePrimaryDomain,
  });

  if (!primaryHost) {
    checks.push({
      id: "missing_primary_domain",
      severity: "critical",
      title: "Missing primary domain",
      detail: "No verified primary production domain is configured for canonicals and sitemaps.",
      fixHint: "Verify a custom domain and mark it primary under Domains & Migration.",
    });
  } else {
    const primaryRow = input.domains.find(
      (d) => normalizeHostname(d.domain) === primaryHost
    );
    if (primaryRow && !primaryRow.verified) {
      checks.push({
        id: "unverified_primary_domain",
        severity: "critical",
        title: "Unverified primary domain",
        detail: `${primaryHost} is marked primary but not verified.`,
        fixHint: "Complete domain verification before allowing indexing.",
      });
    }
  }

  if (!hasAddress(input.profile)) {
    checks.push({
      id: "missing_business_address",
      severity: "critical",
      title: "Missing business address",
      detail: "Local Business profile has no street/city/postcode.",
      fixHint: "Add the full address in the Local Business tab.",
    });
  }

  const homePage = input.pages.find((p) => p.page_key === "home" || p.path === "/");
  if (homePage) {
    const blocks = parseContentBlocks(homePage.content_json);
    const reviewsBlock = blocks.find((b) => b.type === "reviews");
    const hasQuotes =
      reviewsBlock &&
      "items" in reviewsBlock &&
      Array.isArray(reviewsBlock.items) &&
      reviewsBlock.items.some((i) => typeof i?.quote === "string" && i.quote.trim());
    if (!hasQuotes) {
      checks.push({
        id: "missing_homepage_reviews",
        severity: "recommended",
        title: "No approved homepage reviews",
        detail:
          "The public reviews section is hidden until approved testimonial quotes are added to the homepage content blocks.",
        pagePath: homePage.path,
        fixHint: "Add a reviews content block with real customer quotes (do not invent reviews).",
      });
    }
  }

  if (!input.profile?.phone?.trim() && !input.profile?.email?.trim()) {
    checks.push({
      id: "missing_phone_email",
      severity: "critical",
      title: "Missing phone/email",
      detail: "No public phone or email is set on the business profile.",
      fixHint: "Add contact details in Local Business.",
    });
  } else if (!input.profile?.phone?.trim()) {
    checks.push({
      id: "missing_telephone",
      severity: "recommended",
      title: "Missing telephone",
      detail: "No public telephone is set on the business profile.",
      fixHint: "Add a public telephone in Local Business.",
    });
  }

  const termsPage = input.pages.find((p) => p.page_key === "terms" || p.path === "/terms");
  const privacyPage = input.pages.find((p) => p.page_key === "privacy" || p.path === "/privacy");
  if (!termsPage || termsPage.status !== "published") {
    checks.push({
      id: "missing_terms_page",
      severity: "recommended",
      title: "Missing Terms page",
      detail: "No published Terms page was found for footer legal links.",
      fixHint: "Publish a Terms page under Pages (path /terms).",
    });
  }
  if (!privacyPage || privacyPage.status !== "published") {
    checks.push({
      id: "missing_privacy_page",
      severity: "recommended",
      title: "Missing Privacy page",
      detail: "No published Privacy page was found for footer legal links.",
      fixHint: "Publish a Privacy page under Pages (path /privacy).",
    });
  }

  if (
    input.settings?.indexing_mode === "live_indexable" &&
    input.settings.allow_indexing !== false &&
    input.settings.migration_target_domain
  ) {
    const primaryHost = resolvePrimaryCanonicalHost(input.domains as DomainCandidate[], {
      canonicalOverride: input.settings.canonical_domain_override,
      sitePrimaryDomain: input.sitePrimaryDomain,
    });
    const migration = normalizeHostname(input.settings.migration_target_domain);
    if (primaryHost && migration && primaryHost !== migration) {
      checks.push({
        id: "preview_domain_allowing_indexing",
        severity: "critical",
        title: "Testing domain may be indexable during migration",
        detail: `Primary canonical host is ${primaryHost} while migration target is ${migration}. Consider staging_noindex or canonical_to_existing until cutover.`,
        fixHint: "Set indexing mode to staging_noindex or canonical_to_existing in Site Defaults.",
      });
    }
  }

  const pathSet = new Map<string, string[]>();
  const titleSet = new Map<string, string[]>();
  const descSet = new Map<string, string[]>();

  for (const page of input.pages) {
    const paths = pathSet.get(page.path) ?? [];
    paths.push(page.id);
    pathSet.set(page.path, paths);

    if (page.seo_title?.trim()) {
      const t = page.seo_title.trim().toLowerCase();
      const arr = titleSet.get(t) ?? [];
      arr.push(page.path);
      titleSet.set(t, arr);
    }
    if (page.meta_description?.trim()) {
      const d = page.meta_description.trim().toLowerCase();
      const arr = descSet.get(d) ?? [];
      arr.push(page.path);
      descSet.set(d, arr);
    }

    const isPublished = page.status === "published";
    const forceNoindex = page.page_key ? FORCE_NOINDEX_PAGE_KEYS.has(page.page_key) : false;
    const indexable =
      isPublished &&
      !forceNoindex &&
      (page.robots_index ?? input.settings?.default_robots_index ?? true) &&
      (input.settings?.allow_indexing ?? true) &&
      input.settings?.indexing_mode !== "staging_noindex";

    if (isPublished && !page.h1?.trim() && !forceNoindex) {
      checks.push({
        id: `missing_h1:${page.path}`,
        severity: "critical",
        title: "Missing H1",
        detail: `Page ${page.path} has no H1.`,
        pagePath: page.path,
      });
    }

    if (isPublished && !page.title?.trim() && !page.seo_title?.trim()) {
      checks.push({
        id: `missing_title:${page.path}`,
        severity: "critical",
        title: "Missing page title",
        detail: `Page ${page.path} has no title or SEO title.`,
        pagePath: page.path,
      });
    }

    if (isPublished && !forceNoindex && !page.meta_description?.trim() && !input.settings?.default_meta_description) {
      checks.push({
        id: `missing_meta_description:${page.path}`,
        severity: "critical",
        title: "Missing meta description",
        detail: `Page ${page.path} has no meta description and no site default.`,
        pagePath: page.path,
      });
    }

    if (forceNoindex && page.robots_index === true) {
      checks.push({
        id: `transactional_indexable:${page.path}`,
        severity: "critical",
        title: "Public transactional page is indexable",
        detail: `${page.path} (${page.page_key}) is forced noindex by default but robots_index is enabled.`,
        pagePath: page.path,
        fixHint: "Turn off indexing for transactional pages.",
      });
    }

    if (page.canonical_path?.startsWith("http")) {
      try {
        const u = new URL(page.canonical_path);
        if (isUnsafeCanonicalHost(u.hostname)) {
          checks.push({
            id: `bad_canonical:${page.path}`,
            severity: "critical",
            title: "Canonical points to preview/platform domain",
            detail: `${page.path} canonical host ${u.hostname} is not a verified tenant domain.`,
            pagePath: page.path,
          });
        }
      } catch {
        /* ignore */
      }
    }

    const blocks = parseContentBlocks(page.content_json);
    if (indexable && visibleTextLength(blocks) < 80 && page.path !== "/manage-booking") {
      checks.push({
        id: `thin_content:${page.path}`,
        severity: "recommended",
        title: "Thin visible page content",
        detail: `${page.path} has little structured content.`,
        pagePath: page.path,
      });
    }

    const missingAlt = blocks.some(
      (b) =>
        (b.type === "hero" && b.imageUrl && !b.imageAlt) ||
        (b.type === "gallery" && b.images?.some((img) => img.url && !img.alt))
    );
    if (missingAlt) {
      checks.push({
        id: `missing_alt:${page.path}`,
        severity: "recommended",
        title: "Missing image alt text",
        detail: `${page.path} has images without alt text.`,
        pagePath: page.path,
      });
    }

    if (indexable && !page.og_image_url && !input.settings?.default_og_image_url && !input.settings?.logo_url) {
      checks.push({
        id: `missing_og:${page.path}`,
        severity: "recommended",
        title: "Missing OG image",
        detail: `${page.path} has no Open Graph image.`,
        pagePath: page.path,
      });
    }

    if (page.page_key === "faq" || page.path === "/faq") {
      const faqs = faqItemsWithAnswers(blocks, input.profile?.faq);
      const rawFaq = Array.isArray(input.profile?.faq) ? input.profile!.faq : [];
      const questionsOnly =
        rawFaq.length > 0 &&
        faqs.length === 0 &&
        rawFaq.some((f: unknown) => {
          if (!f || typeof f !== "object") return false;
          const q = (f as { q?: string; a?: string }).q;
          const a = (f as { q?: string; a?: string }).a;
          return Boolean(q?.trim()) && !a?.trim();
        });
      if (questionsOnly || (blocks.some((b) => b.type === "faq") && faqs.length === 0)) {
        checks.push({
          id: `faq_no_answers:${page.path}`,
          severity: "recommended",
          title: "FAQ page has questions but no answers",
          detail: "FAQPage structured data will be omitted until answers exist.",
          pagePath: page.path,
        });
      }
    }
  }

  for (const [path, ids] of pathSet) {
    if (ids.length > 1) {
      checks.push({
        id: `duplicate_path:${path}`,
        severity: "critical",
        title: "Duplicate page path",
        detail: `Path ${path} is used by ${ids.length} pages.`,
        pagePath: path,
      });
    }
  }

  for (const [title, paths] of titleSet) {
    if (paths.length > 1) {
      checks.push({
        id: `duplicate_title:${title.slice(0, 40)}`,
        severity: "recommended",
        title: "Duplicate SEO titles",
        detail: `Title reused on: ${paths.join(", ")}`,
      });
    }
  }

  for (const [desc, paths] of descSet) {
    if (paths.length > 1) {
      checks.push({
        id: `duplicate_desc:${desc.slice(0, 40)}`,
        severity: "recommended",
        title: "Duplicate meta descriptions",
        detail: `Description reused on: ${paths.join(", ")}`,
      });
    }
  }

  for (const r of input.redirects) {
    if (!r.active) continue;
    if (
      detectRedirectLoop(
        input.redirects,
        r.old_path,
        r.new_path
      )
    ) {
      checks.push({
        id: `redirect_loop:${r.old_path}`,
        severity: "critical",
        title: "Redirect loop",
        detail: `${r.old_path} → ${r.new_path} participates in a loop.`,
        pagePath: r.old_path,
      });
    }
  }

  // Sitemap exclusion heuristic: published indexable page should be listed
  const indexablePublished = input.pages.filter((p) => {
    if (p.status !== "published") return false;
    if (p.page_key && FORCE_NOINDEX_PAGE_KEYS.has(p.page_key)) return false;
    return p.robots_index ?? input.settings?.default_robots_index ?? true;
  });
  for (const p of indexablePublished) {
    if (p.path === "/checkout" || p.path === "/payment" || p.path === "/success") {
      checks.push({
        id: `sitemap_should_exclude:${p.path}`,
        severity: "critical",
        title: "Public transactional page is indexable",
        detail: `${p.path} should not be indexable.`,
        pagePath: p.path,
      });
    }
  }

  return checks;
}

export function summarizeHealth(checks: HealthCheck[]) {
  return {
    critical: checks.filter((c) => c.severity === "critical").length,
    recommended: checks.filter((c) => c.severity === "recommended").length,
    checks,
  };
}

export function pageHealthWarnings(
  checks: HealthCheck[],
  pagePath: string
): HealthCheck[] {
  const path = normalizeRedirectPath(pagePath);
  return checks.filter((c) => c.pagePath && normalizeRedirectPath(c.pagePath) === path);
}
