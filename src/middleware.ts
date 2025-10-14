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
    pathname.startsWith('/fallback') ||
    pathname.startsWith('/~offline')
  ) {
    return NextResponse.next();
  }

  // --- Custom domain logic ---
  const baseDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'myparkingchannel.app';
  
  // Known custom domains that should be handled by domain route
  const knownCustomDomains = ['parkingexeterairport.co.uk'];
  
  // Check if this is a known custom domain
  if (knownCustomDomains.includes(hostname)) {
    console.log(`[MW] Known custom domain detected: ${hostname} -> /sites/flyparksexeter`);
    return NextResponse.rewrite(new URL(`/sites/flyparksexeter${pathname}`, req.url));
  }
  
  // Check if this is a custom domain (not the base domain and not a subdomain)
  if (hostname !== baseDomain && !hostname.endsWith(`.${baseDomain}`)) {
    console.log(`[MW] Custom domain detected: ${hostname} -> /site/${hostname}`);
    return NextResponse.rewrite(new URL(`/site/${hostname}${pathname}`, req.url));
  }

  // --- Multi-tenant subdomain logic ---
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
