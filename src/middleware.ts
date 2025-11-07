import { NextResponse, NextRequest } from 'next/server';

const PRIMARY_DOMAIN = process.env.PRIMARY_DOMAIN || 'myparkingchannel.app';
const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || 'main';
const SITES_PREFIX = '/sites';

// Paths the middleware must ignore (no rewrites)
const PUBLIC_FILE = /\.(.*)$/;
const IGNORE_PREFIXES = [
  '/api',
  '/_next',
  '/admin',
  '/login',
  '/favicon.ico',
  '/robots.txt',
  '/manifest.webmanifest',
  '/sitemap.xml',
  '/images',
  '/static',
  '/assets'
];

export const config = {
  matcher: [
    // run on everything except the files above (we also check again in code)
    '/((?!_next|.*\\..*|api).*)',
  ],
};

function isIgnoredPath(pathname: string) {
  if (PUBLIC_FILE.test(pathname)) return true;
  return IGNORE_PREFIXES.some(p => pathname.startsWith(p));
}

function getHost(req: NextRequest) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  // strip :port if any
  return host.split(':')[0].toLowerCase();
}

function getSubdomainFromPrimary(host: string) {
  // e.g. foo.myparkingchannel.app -> foo
  if (!host.endsWith(PRIMARY_DOMAIN)) return null;
  const withoutDomain = host.slice(0, -(PRIMARY_DOMAIN.length + 1)); // remove ".myparkingchannel.app"
  if (!withoutDomain) return null; // apex
  return withoutDomain;
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1) Do not touch ignored paths
  if (isIgnoredPath(pathname)) return NextResponse.next();

  // 2) Do not process if we've already been rewritten to /sites/[slug]
  if (pathname.startsWith(`${SITES_PREFIX}/`)) return NextResponse.next();

  const host = getHost(req);

  /**
   * RESOLUTION STRATEGY
   * - Preview hosts (vercel.app): always fallback to DEFAULT_TENANT_SLUG
   * - Primary domain subdomains: use subdomain as tenant slug
   * - Apex PRIMARY_DOMAIN: fallback to DEFAULT_TENANT_SLUG
   * - Custom domains (mapped via Vercel): if you don't have a fast edge lookup, fall back to DEFAULT_TENANT_SLUG
   *   (or call an internal API to resolve, but keep this simple to stop the loop now)
   */

  let tenantSlug: string | null = null;

  const isVercelPreview = host.endsWith('.vercel.app');
  if (isVercelPreview) {
    tenantSlug = DEFAULT_TENANT_SLUG;
  } else {
    const sub = getSubdomainFromPrimary(host);
    if (sub) {
      // e.g. tenant1.myparkingchannel.app
      tenantSlug = sub;
    } else if (host === PRIMARY_DOMAIN || host === `www.${PRIMARY_DOMAIN}`) {
      // apex → default tenant (or marketing site if you use one)
      tenantSlug = DEFAULT_TENANT_SLUG;
    } else {
      // likely a custom domain; if you have a fast lookup, call it here.
      // For now: safe fallback to default to avoid "should not happen" + loops.
      tenantSlug = DEFAULT_TENANT_SLUG;
    }
  }

  if (!tenantSlug) {
    // This should never happen now that we assign DEFAULT_TENANT_SLUG above.
    console.error('❌ [SITE] Unresolved tenant; using hard fallback');
    tenantSlug = DEFAULT_TENANT_SLUG;
  }

  // 3) Build rewrite target, preserving pathname/query
  // If you want per-tenant roots to land on their index: /sites/[slug] + original pathname (commonly '/')
  const rewriteUrl = req.nextUrl.clone();
  rewriteUrl.pathname = `${SITES_PREFIX}/${tenantSlug}${pathname}`;

  // IMPORTANT: rewrite, do NOT redirect (avoids 307 loops)
  return NextResponse.rewrite(rewriteUrl);
}
