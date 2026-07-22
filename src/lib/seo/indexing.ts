import { FORCE_NOINDEX_PAGE_KEYS } from "./types";
import type { IndexingMode, SitePageRow, SiteSeoSettings } from "./types";
import { isPreviewOrDevHost } from "./canonical";

export function shouldForceNoindexPage(pageKey: string | null | undefined): boolean {
  if (!pageKey) return false;
  return FORCE_NOINDEX_PAGE_KEYS.has(pageKey);
}

/**
 * Availability / booking result URLs with date query strings must never be indexable.
 */
export function hasIndexableBookingQuery(searchParams: URLSearchParams | Record<string, string | string[] | undefined> | null | undefined): boolean {
  if (!searchParams) return false;
  const keys = ["from", "to", "start", "end", "arrival", "departure", "date", "dates", "checkin", "checkout"];
  if (searchParams instanceof URLSearchParams) {
    return keys.some((k) => {
      const v = searchParams.get(k);
      return Boolean(v && String(v).trim());
    });
  }
  return keys.some((k) => {
    const v = searchParams[k];
    if (Array.isArray(v)) return v.some((x) => Boolean(x && String(x).trim()));
    return Boolean(v && String(v).trim());
  });
}

export function resolveRobots(args: {
  page: Pick<SitePageRow, "page_key" | "robots_index" | "robots_follow" | "status"> | null;
  settings: Pick<
    SiteSeoSettings,
    "allow_indexing" | "default_robots_index" | "default_robots_follow" | "indexing_mode"
  > | null;
  requestHost?: string | null;
  hasBookingQuery?: boolean;
  isAdminPath?: boolean;
}): { index: boolean; follow: boolean; reason: string } {
  if (args.isAdminPath) {
    return { index: false, follow: false, reason: "admin" };
  }
  if (args.hasBookingQuery) {
    return { index: false, follow: true, reason: "booking_query" };
  }
  if (isPreviewOrDevHost(args.requestHost)) {
    return { index: false, follow: true, reason: "preview_host" };
  }

  const mode: IndexingMode = args.settings?.indexing_mode ?? "live_indexable";
  if (mode === "staging_noindex") {
    return { index: false, follow: true, reason: "staging_noindex" };
  }
  if (args.settings && args.settings.allow_indexing === false) {
    return { index: false, follow: true, reason: "allow_indexing_false" };
  }
  if (args.page?.status && args.page.status !== "published") {
    return { index: false, follow: false, reason: "unpublished" };
  }
  if (shouldForceNoindexPage(args.page?.page_key)) {
    return { index: false, follow: false, reason: "transactional_page" };
  }

  const index =
    args.page?.robots_index ??
    args.settings?.default_robots_index ??
    true;
  const follow =
    args.page?.robots_follow ??
    args.settings?.default_robots_follow ??
    true;

  return { index: Boolean(index), follow: Boolean(follow), reason: "page_or_default" };
}
