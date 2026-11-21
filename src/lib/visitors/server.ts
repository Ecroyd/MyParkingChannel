// Server side of visitor tracking: which car park a beacon belongs to, the cookieless visitor id,
// and the reads behind /admin/visitors. Service role only.

import 'server-only';
import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server-admin';

const BASE_HOST = 'myparkingchannel.app';
const PLATFORM_HOSTS = new Set([BASE_HOST, 'localhost', '127.0.0.1']);

function normalizeHost(raw: string | null): string {
  const h = (raw ?? '').split(':')[0]?.toLowerCase() ?? '';
  return h.startsWith('www.') ? h.slice(4) : h;
}

type CacheEntry = { tenantId: string | null; at: number };
const hostCache = new Map<string, CacheEntry>();
const CACHE_MS = 5 * 60 * 1000;

/**
 * The car park whose site sent the beacon, from the Host header (a custom domain or
 * <slug>.myparkingchannel.app), the same way middleware picks the site. Beacons from the platform
 * host (admin previews at /sites/<slug>) are not counted, except in local development where the
 * page's slug is used so the feature can be tried.
 */
export async function tenantForRequest(rawHost: string | null, slugHint: string | null): Promise<string | null> {
  const host = normalizeHost(rawHost);
  const isDev = process.env.NODE_ENV === 'development';
  let slug: string | null = null;
  let domain: string | null = null;

  if (host.endsWith(`.${BASE_HOST}`)) slug = host.slice(0, -(BASE_HOST.length + 1));
  else if (PLATFORM_HOSTS.has(host) || host.endsWith('.vercel.app')) {
    if (!isDev || !slugHint) return null;
    slug = slugHint;
  } else if (host) domain = host;
  else return null;

  const key = slug ? `slug:${slug}` : `domain:${domain}`;
  const hit = hostCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tenantId;

  const db = createAdminClient();
  let tenantId: string | null = null;
  if (slug) {
    const { data } = await db.from('tenants').select('id').eq('slug', slug).maybeSingle();
    tenantId = (data?.id as string | undefined) ?? null;
  } else {
    const { data } = await db.from('tenant_domains').select('tenant_id').eq('domain', domain).maybeSingle();
    tenantId = (data?.tenant_id as string | undefined) ?? null;
  }
  hostCache.set(key, { tenantId, at: Date.now() });
  return tenantId;
}

/**
 * Cookieless visitor id: the same person on the same day gets the same id; the salt changes every
 * UTC day so nobody can be followed across days, and the IP and browser are never stored.
 */
export function visitorId(tenantId: string, ip: string, userAgent: string, now = new Date()): string {
  const secret = process.env.VISITOR_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'visitors';
  const day = now.toISOString().slice(0, 10);
  const salt = createHash('sha256').update(`${secret}|${day}`).digest('hex');
  return createHash('sha256').update(`${salt}|${tenantId}|${ip}|${userAgent}`).digest('hex').slice(0, 20);
}

export type SiteEventRow = {
  tenant_id: string;
  event: 'pageview' | 'checkout' | 'ping';
  visitor: string;
  path: string;
  entry: boolean;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer_host: string | null;
  country: string | null;
  device: 'mobile' | 'tablet' | 'desktop';
};

export async function recordSiteEvent(row: SiteEventRow): Promise<void> {
  const { error } = await createAdminClient().from('site_events').insert(row);
  if (error) throw new Error(error.message);
}

export type VisitorStats = {
  totals: { visitors: number; visits: number; pageviews: number; checkouts: number };
  daily: Array<{ day: string; visitors: number; pageviews: number; checkouts: number }>;
  sources: Array<{ source: string; medium: string; visitors: number; checkouts: number }>;
  campaigns: Array<{ campaign: string; source: string; visits: number }>;
  referrers: Array<{ referrer_host: string; visits: number }>;
  landing_pages: Array<{ path: string; visits: number }>;
  pages: Array<{ path: string; pageviews: number; visitors: number }>;
  countries: Array<{ country: string; visitors: number }>;
  devices: Array<{ device: string; visitors: number }>;
};

export type LiveVisitors = {
  count: number;
  visitors: Array<{ path: string; last_seen: string; country: string | null; device: string | null; source: string }>;
};

export async function getVisitorStats(tenantId: string, from: Date, to: Date, timezone: string): Promise<VisitorStats> {
  const { data, error } = await createAdminClient().rpc('site_visitor_stats', {
    p_tenant: tenantId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_tz: timezone,
  });
  if (error) throw new Error(error.message);
  return data as VisitorStats;
}

export async function getLiveVisitors(tenantId: string): Promise<LiveVisitors> {
  const { data, error } = await createAdminClient().rpc('site_visitors_live', { p_tenant: tenantId, p_window_minutes: 5 });
  if (error) throw new Error(error.message);
  return data as LiveVisitors;
}

export function isMissingTable(err: unknown): boolean {
  return err instanceof Error && /site_events|site_visitor_stats|site_visitors_live|schema cache/.test(err.message);
}
