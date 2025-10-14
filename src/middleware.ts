import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = req.headers.get('host') || '';
  const pathname = url.pathname;

  // --- Skip localhost, static assets, and non-tenant paths ---
  if (
    hostname.includes('localhost') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/sw') ||
    pathname.startsWith('/workbox') ||
    pathname.startsWith('/fallback')
  ) {
    return NextResponse.next();
  }

  // --- Multi-tenant subdomain logic ---
  const baseDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'myparkingchannel.app';
  const currentHost = hostname.replace(`.${baseDomain}`, '');

  // If subdomain exists (not root), rewrite to /sites/[slug]
  if (currentHost && currentHost !== baseDomain) {
    const slug = currentHost;
    return NextResponse.rewrite(new URL(`/sites/${slug}${pathname}`, req.url));
  }

  // Otherwise, just continue
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'], // only match real app routes
};
