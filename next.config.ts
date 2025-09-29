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

    // Compute Supabase origins from env (no hardcoding)
    const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    let supaOrigin = '';
    let supaHost = '';
    try {
      const u = new URL(SUPA);
      supaOrigin = `${u.protocol}//${u.host}`; // e.g. https://abcd.supabase.co
      supaHost = u.host;                        // e.g. abcd.supabase.co
    } catch {
      // no env or bad URL; we still add wildcard fallbacks below
    }

    const stripeJs = 'https://js.stripe.com';
    const stripeNet = 'https://m.stripe.network';
    const stripeApi = 'https://api.stripe.com';
    const vercelVitals = 'https://vitals.vercel-insights.com';

    // IMPORTANT: remove 'prefetch-src' (not supported); keep directives valid
    const csp = [
      `default-src 'self'`,
      // allow loading scripts (Stripe)
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${stripeJs}`,
      // Tailwind/Next need inline styles occasionally
      `style-src 'self' 'unsafe-inline'`,
      // images from anywhere over https (covers Supabase storage image URLs)
      `img-src 'self' data: blob: https:`,
      `media-src 'self' https:`,
      `font-src 'self' data: https:`,
      // XHR/fetch/websocket endpoints (Supabase, Stripe, vitals)
      `connect-src 'self' ${
        supaOrigin ? `${supaOrigin} wss://${supaHost}` : ''
      } https://*.supabase.co wss://*.supabase.co ${stripeJs} ${stripeNet} ${stripeApi} ${vercelVitals}`,
      // service workers & workers
      `worker-src 'self' blob:`,
      // Stripe embeds
      `frame-src 'self' ${stripeJs}`,
      // security hardening
      `base-uri 'self'`,
      `form-action 'self'`,
      `object-src 'none'`,
      `frame-ancestors 'self'`,
    ].join('; ');

    headers.push({
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        // Debug echo so you can see what's being sent in the Network tab
        { key: 'X-Debug-CSP', value: csp.slice(0, 900) },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
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