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

  // Always add a debug header so we can see decisions in the Network tab
  if (slug) {
    const rewriteTo = `/sites/${slug}${pathname}`;
    const res = NextResponse.rewrite(new URL(rewriteTo, req.url));
    res.headers.set("x-pc-mw", "rewrite");
    res.headers.set("x-pc-host", host);
    res.headers.set("x-pc-slug", slug);
    res.headers.set("x-pc-path", pathname);
    return res;
  } else {
    const res = NextResponse.next();
    res.headers.set("x-pc-mw", "pass");
    res.headers.set("x-pc-host", host);
    res.headers.set("x-pc-slug", "");
    res.headers.set("x-pc-path", pathname);
    return res;
  }
}

export const config = {
  matcher: ["/:path*"],
};
