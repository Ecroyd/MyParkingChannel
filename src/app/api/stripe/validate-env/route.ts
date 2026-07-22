// app/api/stripe/validate-env/route.ts
import { NextResponse } from 'next/server';
import { ROOT_URL } from '@/lib/stripe';

export async function GET() {
  const forceTest = process.env.STRIPE_MODE === 'test';
  const isLive = process.env.NODE_ENV === 'production' && !forceTest;

  // Platform uses STRIPE_SECRET_KEY_LIVE / _TEST (or STRIPE_SECRET_KEY fallback)
  const hasSecret = isLive
    ? !!(process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_'))
    : !!(process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') || process.env.STRIPE_SECRET_KEY);

  const requiredChecks: Record<string, boolean> = {
    NEXT_PUBLIC_ROOT_URL: !!process.env.NEXT_PUBLIC_ROOT_URL,
    STRIPE_SECRET: hasSecret,
    STRIPE_CLIENT_ID: isLive
      ? !!process.env.STRIPE_CLIENT_ID_LIVE
      : !!process.env.STRIPE_CLIENT_ID_TEST,
  };

  const optionalChecks: Record<string, boolean> = {
    STRIPE_SECRET_KEY_TEST: !!process.env.STRIPE_SECRET_KEY_TEST,
    STRIPE_SECRET_KEY_LIVE: !!process.env.STRIPE_SECRET_KEY_LIVE,
    STRIPE_CLIENT_ID_TEST: !!process.env.STRIPE_CLIENT_ID_TEST,
    STRIPE_CLIENT_ID_LIVE: !!process.env.STRIPE_CLIENT_ID_LIVE,
    STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE,
  };

  const missing = Object.entries(requiredChecks)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);
  const present = Object.entries(requiredChecks)
    .filter(([, ok]) => ok)
    .map(([key]) => key);

  return NextResponse.json({
    status: missing.length === 0 ? 'ready' : 'missing_config',
    platformMode: isLive ? 'live' : 'test',
    STRIPE_MODE: process.env.STRIPE_MODE ?? null,
    required: { missing, present },
    optional: {
      present: Object.entries(optionalChecks).filter(([, ok]) => ok).map(([k]) => k),
      missing: Object.entries(optionalChecks).filter(([, ok]) => !ok).map(([k]) => k),
    },
    // Register these URLs in Stripe Dashboard (Live mode)
    connectOAuthRedirectUri: `${ROOT_URL}/api/payments/connect/status`,
    webhookEndpoint: `${ROOT_URL}/api/stripe/webhook`,
    message: missing.length === 0
      ? 'All required environment variables are set. Stripe Connect is ready to use.'
      : `Missing required variables: ${missing.join(', ')}. Please set these in your environment.`,
  });
}
