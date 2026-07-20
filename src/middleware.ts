// src/middleware.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PLATFORM_HOSTS = [
  "myparkingchannel.app",
  "www.myparkingchannel.app",
  "localhost",
  "localhost:3000",
  "localhost:3002",
  "127.0.0.1",
  "127.0.0.1:3000",
  "127.0.0.1:3002",
];

// IMPORTANT: service key is OK here because middleware runs on the server.
// Do NOT expose it to the client.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
  }
);

function normalizeHost(rawHost: string | null): string {
  if (!rawHost) return "";
  const hostOnly = rawHost.split(":")[0]?.toLowerCase() ?? "";
  return hostOnly.startsWith("www.") ? hostOnly.slice(4) : hostOnly;
}

function isPlatformHost(rawHost: string | null, normalizedHost: string): boolean {
  if (!rawHost && !normalizedHost) return true;
  // Check both raw and normalized against platform hosts
  if (PLATFORM_HOSTS.includes(rawHost ?? "") || 
      PLATFORM_HOSTS.some(ph => normalizeHost(ph) === normalizedHost)) {
    return true;
  }
  // Treat all Vercel preview/deployment domains as platform hosts
  if (normalizedHost.includes('.vercel.app')) {
    return true;
  }
  return false;
}

export const config = {
  matcher: [
    // match everything except static files & public assets
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const rawHost = req.headers.get("host");
  const normalizedHost = normalizeHost(rawHost);
  const isDev = process.env.NODE_ENV === "development";

  // In development, do not serve the service worker (stale precache causes 404s for chunks like app-pages-internals.js)
  if (isDev && (url.pathname === "/sw.js" || url.pathname.startsWith("/workbox-") || url.pathname.startsWith("/fallback-"))) {
    return new NextResponse(null, { status: 404 });
  }

  // In development on platform hosts: serve a one-time bootstrap page that unregisters any
  // service worker and clears caches, then redirects. This fixes stale SW returning cached HTML
  // that references old chunk URLs (main-app.js, app-pages-internals.js) which 404 in dev.
  const accept = req.headers.get("accept") ?? "";
  const isDocRequest =
    req.method === "GET" &&
    accept.includes("text/html") &&
    !url.pathname.startsWith("/api") &&
    !url.pathname.startsWith("/_next");
  const alreadyBypassed = url.searchParams.get("_dev_sw") === "1";
  const isPlatform = !normalizedHost || isPlatformHost(rawHost, normalizedHost);
  // Force bootstrap via dedicated URL or query param (SW often never cached these, so request hits server)
  const forceBootstrap =
    isDev &&
    isPlatform &&
    req.method === "GET" &&
    (url.pathname === "/dev-clear-sw" || url.searchParams.get("__clear_sw") === "1");
  const willServeBootstrap =
    isDev &&
    isPlatform &&
    (forceBootstrap || (isDocRequest && !alreadyBypassed));

  if (willServeBootstrap) {
    // Redirect target: if they hit /dev-clear-sw, send them to home; else same path with _dev_sw=1
    const nextParams = new URLSearchParams(url.searchParams);
    nextParams.delete("__clear_sw");
    nextParams.set("_dev_sw", "1");
    const redirectPath =
      url.pathname === "/dev-clear-sw"
        ? "/?_dev_sw=1"
        : url.pathname + "?" + nextParams.toString();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Loading...</title></head><body><p>Clearing service worker for dev...</p><script>
(function() {
  var redirect = "${redirectPath.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}";
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(regs) {
      return Promise.all(regs.map(function(r) { return r.unregister(); }));
    }).then(function() {
      if (typeof caches !== "undefined") {
        return caches.keys().then(function(keys) { return Promise.all(keys.map(function(k) { return caches.delete(k); })); });
      }
    }).then(function() { location.replace(redirect); }, function() { location.replace(redirect); });
  } else {
    location.replace(redirect);
  }
})();
</script></body></html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 🔴 Do NOT rewrite API routes, PWA assets, manifest, or static files
  // These should always go to root paths, not tenant-specific paths
  // Decode URL to handle encoded filenames (e.g., parking%20favicon.png)
  const decodedPath = decodeURIComponent(url.pathname);
  const isStaticFile = /\.(svg|png|jpg|jpeg|gif|ico|webp|woff|woff2|ttf|eot|css|js|json|xml|txt)$/i.test(decodedPath);
  
  if (
    url.pathname.startsWith("/api") ||
    url.pathname === "/sw.js" ||
    url.pathname.startsWith("/workbox-") ||
    url.pathname.startsWith("/fallback-") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/~offline" ||
    url.pathname.startsWith("/_next") ||
    isStaticFile ||
    decodedPath.includes("file.svg") ||
    decodedPath.includes("parking") && decodedPath.includes("favicon")
  ) {
    return NextResponse.next();
  }

  // If it's one of the platform hosts, just let the normal routing handle it
  if (!normalizedHost || isPlatformHost(rawHost, normalizedHost)) {
    return NextResponse.next();
  }

  try {
    let slug: string | null = null;

    // First, try to extract slug from subdomain (e.g., flyparksexeter.myparkingchannel.app)
    const baseHost = "myparkingchannel.app";
    if (normalizedHost.endsWith("." + baseHost)) {
      slug = normalizedHost.slice(0, -(baseHost.length + 1));
    }

    // If not a subdomain, look up in tenant_domains table
    if (!slug) {
      const { data: domainRow, error: domainError } = await supabase
        .from("tenant_domains")
        .select("tenant_id, tenants!inner(slug)")
        .eq("domain", normalizedHost)
        .maybeSingle();

      if (domainError) {
        console.error("[TENANT_RESOLVE] domainError", domainError);
      }

      slug =
        (domainRow as any)?.tenants?.slug ??
        (domainRow as any)?.slug ??
        null;
    }

    if (!slug) {
      // Unknown domain → DO NOT fall back to platform site, show a specific page
      url.pathname = "/site-not-available";
      return NextResponse.rewrite(url);
    }

    // 2) Rewrite to the tenant site, preserving the rest of the path
    // Example:
    //   /           → /sites/flyparksexeter
    //   /booking    → /sites/flyparksexeter/booking
    const originalPath = url.pathname === "/" ? "" : url.pathname;
    url.pathname = `/sites/${slug}${originalPath}`;
    return NextResponse.rewrite(url);
  } catch (err) {
    console.error("[TENANT_RESOLVE] Unexpected error", err);
    // Fail safe: show site-not-available instead of wrong brand
    url.pathname = "/site-not-available";
    return NextResponse.rewrite(url);
  }
}
