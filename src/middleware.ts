// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from '@/lib/supabase/server';

const ENABLED =
  String(process.env.SITE_ROUTES_ENABLED || "").toLowerCase() === "true";

// Paths that must never be tenant-routed
const STATIC_PATHS = [
  "/favicon.ico",
  "/robots.txt",
  "/manifest.webmanifest",
  "/icons",
  "/_next",
  "/assets",
  "/api/site/resolve",
  "/api/_debug", // our host/slug debug endpoint below
  "/api/manage-booking", // manage booking API routes
];

function isStaticPath(pathname: string) {
  return STATIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function getTenantSlugFromHost(hostname: string): string | null {
  const host = (hostname || "").toLowerCase().split(":")[0];

  // localhost rules
  if (host === "localhost") return null;
  if (host.endsWith(".localhost")) {
    const sub = host.slice(0, -".localhost".length);
    return sub || null;
  }

  // prod apex domains (no slug)
  const APEX = ["myparkingchannel.app"]; // add more if needed
  if (APEX.some((d) => host === d || host === `www.${d}`)) return null;

  // generic subdomain.foo.bar -> "subdomain"
  const parts = host.split(".");
  if (parts.length > 2) return parts[0];

  return null;
}

export async function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const host = req.headers.get("host") ?? url.hostname;

  // Keep original response by default
  let res = NextResponse.next();

  // Lightweight diagnostics (enabled only when NEXT_PUBLIC_DEBUG_SITE)
  const debug = process.env.NEXT_PUBLIC_DEBUG_SITE === '1';
  if (debug) {
    console.log('[MW] host=', host, 'pathname=', pathname);
  }

  if (isStaticPath(pathname)) return res;

  // Global kill switch
  if (!ENABLED) return res;

  const slug = getTenantSlugFromHost(host);

  // Add tenant resolution logging for debug mode
  if (debug) {
    const isSiteRoute = pathname.startsWith('/sites/') || pathname === '/' || pathname.startsWith('/site/');
    if (isSiteRoute) {
      try {
        const sb = await createServerClient({ admin: true });
        let resolved: any = null;

        // Try domain-based resolution first
        if (host && !slug) {
          const { data } = await sb
            .from('tenant_domains')
            .select('tenant_id,domain,enabled,verified_at')
            .eq('domain', host)
            .maybeSingle();
          resolved = { by: 'domain', record: data };
        }

        // Try slug-based resolution
        if (!resolved && slug) {
          const { data } = await sb
            .from('tenants')
            .select('id,slug,name,site_published,created_at')
            .eq('slug', slug)
            .maybeSingle();
          resolved = { by: 'slug', record: data };
        }

        console.log('[MW] resolvedTenant=', resolved);
      } catch (e) {
        console.error('[MW] tenant resolve error', e);
      }
    }
  }

  // Handle subdomain cases (slug.baseDomain)
  if (slug) {
    const rewriteTo = `/sites/${slug}${pathname}`;
    res = NextResponse.rewrite(new URL(rewriteTo, req.url));
    res.headers.set("x-pc-mw", "rewrite");
    res.headers.set("x-pc-host", host);
    res.headers.set("x-pc-slug", slug);
    res.headers.set("x-pc-path", pathname);
    return res;
  } 
  
  // Handle custom domains - check if this is a custom domain that should show a tenant site
  // For now, we'll let the /site/[domain] route handle this
  // This could be enhanced to check a database for custom domain mappings
  const isCustomDomain = !host.includes('myparkingchannel.app') && 
                         !host.includes('localhost') && 
                         !host.includes('127.0.0.1');
  
  if (isCustomDomain) {
    const rewriteTo = `/site/${host}${pathname}`;
    res = NextResponse.rewrite(new URL(rewriteTo, req.url));
    res.headers.set("x-pc-mw", "custom-domain");
    res.headers.set("x-pc-host", host);
    res.headers.set("x-pc-domain", host);
    res.headers.set("x-pc-path", pathname);
    return res;
  }

  // Default case - let it pass through to the main app
  res.headers.set("x-pc-mw", "pass");
  res.headers.set("x-pc-host", host);
  res.headers.set("x-pc-slug", "");
  res.headers.set("x-pc-path", pathname);
  return res;
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api/debug).*)'], // don't log debug API itself
};
