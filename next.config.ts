// @ts-check
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";

/** @type {import('next').NextConfig} */
const baseConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['@supabase/supabase-js'],
  images: { 
    domains: ["*.supabase.co", "localhost"] 
  },
  async headers() {
    // SW should never be cached; also add a few safe security headers
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
        ]
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" }
        ]
      }
    ];
  }
};

export default async (phase: any) => {
  // Only wrap with PWA for dev server + prod build
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) {
    const withPWA = (await import("@ducanh2912/next-pwa")).default({
      dest: "public",
      disable: process.env.NODE_ENV === "development",
      cacheStartUrl: true,
      dynamicStartUrl: true,
      reloadOnOnline: true,
      fallbacks: { document: "/~offline" }, // we'll add this page below
      // Extend runtime caching to play nice with Supabase
      extendDefaultRuntimeCaching: true,
      workboxOptions: {
        runtimeCaching: [
          // Cache GET requests for public assets (images, css, js)
          {
            urlPattern: ({ request }: any) =>
              ["style", "script", "image", "font"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "assets" }
          },
          // Cache Supabase Storage public assets (icons, logos, etc.)
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\/.+/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "supabase-storage" }
          },
          // DO NOT cache Supabase REST/POST; only allow GET JSON with care
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/.+/i,
            handler: "NetworkFirst",
            method: "GET",
            options: { cacheName: "supabase-rest-get", networkTimeoutSeconds: 3 }
          }
        ]
      }
    });
    return withPWA(baseConfig);
  }
  return baseConfig;
};