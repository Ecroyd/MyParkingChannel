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
    const headers = [];

    // Derive Supabase origins from env (don't hardcode)
    const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    let supaOrigin = '';
    let supaWss = '';
    try {
      const u = new URL(SUPA_URL);
      supaOrigin = `${u.protocol}//${u.host}`;     // e.g. https://abcd.supabase.co
      supaWss = `wss://${u.host}`;                 // e.g. wss://abcd.supabase.co
    } catch {}

    // Stripe origins we need for Stripe.js
    const stripeJs = 'https://js.stripe.com';
    const stripeNet = 'https://m.stripe.network';
    const stripeApi = 'https://api.stripe.com';

    // Optional: Vercel Web Vitals/analytics
    const vercelVitals = 'https://vitals.vercel-insights.com';

    // NOTE: Keep CSP a single string; add only what you actually use.
    const csp = [
      // Base
      `default-src 'self'`,
      // Scripts (Next, your app, Stripe.js; allow 'unsafe-inline' only if you have inline scripts)
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${stripeJs}`,
      // Styles (Tailwind needs 'unsafe-inline' for injected styles)
      `style-src 'self' 'unsafe-inline'`,
      // Images & media
      `img-src 'self' data: blob: https:`,
      `media-src 'self' https:`,
      // Fonts
      `font-src 'self' data: https:`,
      // XHR/fetch/websocket endpoints (Supabase, Stripe, analytics)
      `connect-src 'self' ${supaOrigin} ${supaWss} ${stripeJs} ${stripeNet} ${stripeApi} ${vercelVitals}`,
      // if you use Google Maps or other APIs, add them above ↑
      // Workers & service worker
      `worker-src 'self' blob:`,
      // Frames/iframes (Stripe uses iframes)
      `frame-src 'self' ${stripeJs}`,
      // Prefetching (PWA/Next)
      `prefetch-src 'self'`,
      // Manifest
      `manifest-src 'self'`,
      // Base URI
      `base-uri 'self'`,
      // Form actions
      `form-action 'self'`,
      // Object
      `object-src 'none'`,
      // Sandbox (optional hardening, loosen if needed)
      // `sandbox allow-same-origin allow-scripts allow-forms allow-popups`,
    ].join('; ');

    headers.push({
      // Apply to everything; you can scope to only tenant/public routes if preferred
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'X-XSS-Protection', value: '0' }, // modern browsers ignore; kept for legacy
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    });

    // SW should never be cached; also add a few safe security headers
    headers.push({
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" }
      ]
    });

    return headers;
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