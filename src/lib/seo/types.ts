/** System page keys supported by the tenant website SEO control centre. */
export const SYSTEM_PAGE_KEYS = [
  "home",
  "book",
  "directions",
  "faq",
  "contact",
  "manage_booking",
  "checkout",
  "payment",
  "confirmation",
  "customer_account",
] as const;

export type SystemPageKey = (typeof SYSTEM_PAGE_KEYS)[number];

export type PageStatus = "draft" | "published" | "archived";

export type IndexingMode = "live_indexable" | "staging_noindex" | "canonical_to_existing";

export type CookieConsentMode = "off" | "basic" | "strict";

/** Pages that must default to noindex regardless of site defaults. */
export const FORCE_NOINDEX_PAGE_KEYS: ReadonlySet<string> = new Set([
  "manage_booking",
  "checkout",
  "payment",
  "confirmation",
  "customer_account",
]);

/** Default path and indexing for system pages. */
export const SYSTEM_PAGE_DEFAULTS: Record<
  SystemPageKey,
  {
    path: string;
    title: string;
    navLabel: string | null;
    showInNav: boolean;
    robotsIndex: boolean;
    navOrder: number;
  }
> = {
  home: { path: "/", title: "Home", navLabel: "Home", showInNav: true, robotsIndex: true, navOrder: 0 },
  book: { path: "/book", title: "Book", navLabel: "Book", showInNav: true, robotsIndex: true, navOrder: 10 },
  directions: {
    path: "/directions",
    title: "Directions",
    navLabel: "Directions",
    showInNav: true,
    robotsIndex: true,
    navOrder: 20,
  },
  faq: { path: "/faq", title: "FAQ", navLabel: "FAQ", showInNav: true, robotsIndex: true, navOrder: 30 },
  contact: {
    path: "/contact",
    title: "Contact",
    navLabel: "Contact",
    showInNav: true,
    robotsIndex: true,
    navOrder: 40,
  },
  manage_booking: {
    path: "/manage-booking",
    title: "Manage Booking",
    navLabel: "Manage Booking",
    showInNav: true,
    robotsIndex: false,
    navOrder: 50,
  },
  checkout: {
    path: "/checkout",
    title: "Checkout",
    navLabel: null,
    showInNav: false,
    robotsIndex: false,
    navOrder: 90,
  },
  payment: {
    path: "/payment",
    title: "Payment",
    navLabel: null,
    showInNav: false,
    robotsIndex: false,
    navOrder: 91,
  },
  confirmation: {
    path: "/success",
    title: "Booking Confirmation",
    navLabel: null,
    showInNav: false,
    robotsIndex: false,
    navOrder: 92,
  },
  customer_account: {
    path: "/account",
    title: "Account",
    navLabel: null,
    showInNav: false,
    robotsIndex: false,
    navOrder: 93,
  },
};

export type SitePageRow = {
  id: string;
  site_id: string;
  path: string;
  title: string;
  content_md: string;
  page_key: string | null;
  h1: string | null;
  excerpt: string | null;
  content_json: unknown;
  seo_title: string | null;
  meta_description: string | null;
  canonical_path: string | null;
  robots_index: boolean | null;
  robots_follow: boolean | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  nav_label: string | null;
  nav_order: number | null;
  show_in_navigation: boolean;
  status: PageStatus;
  published_at: string | null;
  updated_at: string;
  created_at: string;
};

export type SiteSeoSettings = {
  id: string;
  site_id: string;
  tenant_id: string;
  website_name: string | null;
  alternative_site_name: string | null;
  default_title_template: string | null;
  default_meta_description: string | null;
  default_og_image_url: string | null;
  default_robots_index: boolean;
  default_robots_follow: boolean;
  primary_language: string;
  allow_indexing: boolean;
  schema_business_type: string;
  logo_url: string | null;
  favicon_url: string | null;
  indexing_mode: IndexingMode;
  migration_target_domain: string | null;
  migration_notes: string | null;
  canonical_domain_override: string | null;
  google_search_console_verification: string | null;
  ga4_measurement_id: string | null;
  google_tag_manager_id: string | null;
  bing_verification: string | null;
  microsoft_clarity_id: string | null;
  cookie_consent_mode: CookieConsentMode;
  last_published_at: string | null;
  /** Optional homepage presentation overrides (section visibility, footer blurb, hero extras). */
  presentation_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type SiteRedirect = {
  id: string;
  site_id: string;
  tenant_id: string;
  old_path: string;
  new_path: string;
  status_code: 301 | 302;
  active: boolean;
  hit_count: number;
  last_hit_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantDomainRow = {
  id: string;
  domain: string;
  is_primary: boolean | null;
  verified: boolean | null;
  tenant_id: string;
};

export type HealthSeverity = "critical" | "recommended";

export type HealthCheck = {
  id: string;
  severity: HealthSeverity;
  title: string;
  detail: string;
  pagePath?: string;
  fixHint?: string;
};
