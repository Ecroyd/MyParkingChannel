// @ts-check
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";

/** @type {import('next').NextConfig} */
const baseConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    '@supabase/supabase-js',
    'ssh2',
    'ssh2-sftp-client',
  ],
  images: { 
    domains: ["*.supabase.co", "localhost"] 
  },
  webpack: (config: any, { isServer }: any) => {
    // Exclude native modules from client-side bundling
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    // Ignore native bindings for ssh2
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push({
        'ssh2': 'commonjs ssh2',
        'ssh2-sftp-client': 'commonjs ssh2-sftp-client',
      });
    }
    return config;
  },
  // Optimize CSS loading to prevent preload warnings
  experimental: {
    optimizeCss: true,
  },
  // Disable ESLint during builds to avoid configuration issues
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: isDev 
          ? `
            default-src 'self';
            script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com;
            style-src 'self' 'unsafe-inline';
            img-src 'self' data: blob: https:;
            media-src 'self' https:;
            font-src 'self' data: https:;
            connect-src 'self' https://*.supabase.co wss://*.supabase.co https://js.stripe.com https://api.stripe.com;
            frame-src 'self' https://js.stripe.com;
          `.replace(/\n/g, " ") // remove line breaks for HTTP header
          : `
            default-src 'self';
            script-src 'self' 'unsafe-inline' https://js.stripe.com;
            style-src 'self' 'unsafe-inline';
            img-src 'self' data: blob: https:;
            media-src 'self' https:;
            font-src 'self' data: https:;
            connect-src 'self' https://*.supabase.co wss://*.supabase.co https://js.stripe.com https://api.stripe.com;
            frame-src 'self' https://js.stripe.com;
          `.replace(/\n/g, " ") // remove line breaks for HTTP header
      }
    ];

    const cacheHeaders = [
      {
        source: '/(sw|workbox-.*|fallback-.*)\\.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
    ];

    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      ...cacheHeaders,
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
        // Skip preloading CSS files that aren't immediately used
        skipWaiting: true,
        clientsClaim: true,
        // Exclude problematic files from precaching
        exclude: [
          /file\.svg$/,
          /parking.*favicon\.png$/i,
          /parking%20favicon\.png$/i,
          /^\/_next\/static\/css\/.*\.css$/,
        ],
        // Don't fail on missing precache files
        dontCacheBustURLsMatching: /\.\w{8}\./,
        // Ignore precache errors for missing files
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
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