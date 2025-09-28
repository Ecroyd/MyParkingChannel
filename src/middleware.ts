// src/middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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

export function middleware(req: NextRequest) {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const host = req.headers.get("host") ?? url.hostname;

  if (isStaticPath(pathname)) return NextResponse.next();

  // Global kill switch
  if (!ENABLED) return NextResponse.next();

  const slug = getTenantSlugFromHost(host);

  // Handle subdomain cases (slug.baseDomain)
  if (slug) {
    const rewriteTo = `/sites/${slug}${pathname}`;
    const res = NextResponse.rewrite(new URL(rewriteTo, req.url));
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
    const res = NextResponse.rewrite(new URL(rewriteTo, req.url));
    res.headers.set("x-pc-mw", "custom-domain");
    res.headers.set("x-pc-host", host);
    res.headers.set("x-pc-domain", host);
    res.headers.set("x-pc-path", pathname);
    return res;
  }

  // Default case - let it pass through to the main app
  const res = NextResponse.next();
  res.headers.set("x-pc-mw", "pass");
  res.headers.set("x-pc-host", host);
  res.headers.set("x-pc-slug", "");
  res.headers.set("x-pc-path", pathname);
  return res;
}

export const config = {
  matcher: ["/:path*"],
};
