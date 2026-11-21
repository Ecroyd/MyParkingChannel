// POST /api/public/track — beacon from every tenant site page (src/components/site/SiteTracker.tsx).
// Body: { event: 'pageview' | 'checkout' | 'ping', path, url?, referrer?, entry?, slug? }
// Always answers 204 so a tracking problem never shows up on the site.

import { NextRequest, NextResponse } from 'next/server';
import { BOT_UA, classifySource, cleanPath, deviceFromUserAgent } from '@/lib/visitors/source';
import { recordSiteEvent, tenantForRequest, visitorId } from '@/lib/visitors/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVENTS = new Set(['pageview', 'checkout', 'ping']);
const done = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get('user-agent') ?? '';
    if (!ua || BOT_UA.test(ua)) return done();

    const text = await req.text();
    if (text.length > 4000) return done();
    const body = JSON.parse(text || '{}') as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : null);

    const event = str(body.event);
    if (!event || !EVENTS.has(event)) return done();

    const tenantId = await tenantForRequest(req.headers.get('host'), str(body.slug));
    if (!tenantId) return done();

    const ip =
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      '0.0.0.0';

    // Only the first page of a visit carries where it came from.
    const entry = event === 'pageview' && body.entry === true;
    const origin = entry ? classifySource(str(body.url) ?? '', str(body.referrer)) : null;

    await recordSiteEvent({
      tenant_id: tenantId,
      event: event as 'pageview' | 'checkout' | 'ping',
      visitor: visitorId(tenantId, ip, ua),
      path: cleanPath(str(body.path)),
      entry,
      source: origin?.source ?? null,
      medium: origin?.medium ?? null,
      campaign: origin?.campaign ?? null,
      referrer_host: origin?.referrerHost ?? null,
      country: req.headers.get('x-vercel-ip-country')?.slice(0, 2) || null,
      device: deviceFromUserAgent(ua),
    });
  } catch (err) {
    console.warn('[track] dropped event', err instanceof Error ? err.message : err);
  }
  return done();
}
