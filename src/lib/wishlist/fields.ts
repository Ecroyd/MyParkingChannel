// Wishlist and bugs: the shape of a request and the rules that don't need the database.
// Shared by the API routes and the /admin/wishlist page.

import { z } from 'zod';

export const WISHLIST_BUCKET = 'wishlist-files';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 8;
export const MAX_LINKS = 5;

export const KINDS = ['feature', 'change', 'bug'] as const;
export type WishlistKind = (typeof KINDS)[number];
export const KIND_LABELS: Record<WishlistKind, string> = {
  feature: 'Feature request',
  change: 'Change',
  bug: 'Bug',
};

export const STATUSES = ['new', 'planned', 'done', 'declined'] as const;
export type WishlistStatus = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<WishlistStatus, string> = {
  new: 'New',
  planned: 'Planned',
  done: 'Done',
  declined: 'Declined',
};

export const AREAS = [
  'Dashboard',
  'Today',
  'Bookings',
  'Imports and emails',
  'Pricing',
  'ANPR and gates',
  'Booking website',
  'Payments',
  'Reports',
  'Settings',
  'Other',
] as const;

export type WishlistItem = {
  id: string;
  tenant_id: string;
  kind: WishlistKind;
  area: string;
  title: string;
  description: string;
  links: string[];
  files: string[];
  status: WishlistStatus;
  reply: string | null;
  replied_at: string | null;
  created_by: string;
  created_by_name: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

/** What the page shows for each request: the row plus who's backing it. */
export type WishlistView = WishlistItem & {
  votes: number;
  voted: boolean;
  mine: boolean;
  tenant_name: string | null;
};

/** A pasted address, tidied: whitespace trimmed, `https://` added when there's no scheme. */
export function normaliseLink(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return s;
  return `https://${s}`;
}

const linkSchema = z
  .string()
  .max(2000)
  .transform(normaliseLink)
  .refine((s) => s === '' || s.startsWith('/') || /^https?:\/\/[^\s]+$/i.test(s), 'One of the links is not a web address.');

export const itemSchema = z.object({
  kind: z.enum(KINDS),
  area: z.enum(AREAS),
  title: z.string().trim().min(1, 'Give it a short title.').max(200, 'Keep the title under 200 characters.'),
  description: z.string().trim().max(10_000, 'The description is too long.').default(''),
  links: z
    .array(linkSchema)
    .max(MAX_LINKS, `Add at most ${MAX_LINKS} links.`)
    .default([])
    .transform((links) => [...new Set(links.filter(Boolean))]),
});
export type ItemInput = z.infer<typeof itemSchema>;

export const triageSchema = z.object({
  status: z.enum(STATUSES),
  reply: z
    .string()
    .trim()
    .max(5000)
    .nullable()
    .default(null)
    .transform((s) => (s ? s : null)),
});
export type TriageInput = z.infer<typeof triageSchema>;

/** The person who posted it, or a platform admin. */
export function canEditItem(item: Pick<WishlistItem, 'created_by'>, userId: string, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || item.created_by === userId;
}

/** Storage path for an uploaded file: <tenant>/<item>/<n>-<safe name>. */
export function filePath(tenantId: string, itemId: string, index: number, name: string): string {
  const safe =
    name
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/-\./g, '.')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80) || 'file';
  return `${tenantId}/${itemId}/${Date.now()}-${index}-${safe}`;
}

/** The file name people see, without the path and the upload prefix. */
export function fileLabel(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/^\d+-\d+-/, '');
}

export function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(path);
}

export type SortKey = 'newest' | 'wanted';

/** Most wanted: votes, then newest. Newest: posting time. */
export function sortItems<T extends Pick<WishlistView, 'votes' | 'created_at'>>(items: T[], sort: SortKey): T[] {
  const byNewest = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  return [...items].sort(sort === 'wanted' ? (a, b) => b.votes - a.votes || byNewest(a, b) : byNewest);
}

export type StatusFilter = 'open' | 'all' | WishlistStatus;

export function matchesFilters(
  item: Pick<WishlistView, 'kind' | 'area' | 'status' | 'title' | 'description' | 'created_by_name' | 'tenant_name'>,
  f: { kind: WishlistKind | 'all'; area: string; status: StatusFilter; search: string }
): boolean {
  if (f.kind !== 'all' && item.kind !== f.kind) return false;
  if (f.area !== 'all' && item.area !== f.area) return false;
  if (f.status === 'open' ? item.status !== 'new' && item.status !== 'planned' : f.status !== 'all' && item.status !== f.status) {
    return false;
  }
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.description, item.created_by_name, item.tenant_name].some((s) => s?.toLowerCase().includes(q));
}
