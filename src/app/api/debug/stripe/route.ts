// Debug endpoint to check Stripe configuration (no secrets exposed)
import { NextResponse } from 'next/server';
import { isStripeConfigured, ROOT_URL } from '@/lib/stripe';

export async function GET() {
  const forceTest = process.env.STRIPE_MODE === 'test';
  const isLive = process.env.NODE_ENV === 'production' && !forceTest;
  const isTestMode = forceTest || process.env.NODE_ENV !== 'production';

  const hasLiveSecret =
    !!process.env.STRIPE_SECRET_KEY_LIVE ||
    !!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_');
  const hasTestSecret =
    !!process.env.STRIPE_SECRET_KEY_TEST ||
    !!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');

  const liveReadyIssues: string[] = [];
  if (!hasLiveSecret) liveReadyIssues.push('MISSING_LIVE_SECRET');
  if (!process.env.STRIPE_CLIENT_ID_LIVE) liveReadyIssues.push('MISSING_CLIENT_ID_LIVE');
  if (!process.env.STRIPE_WEBHOOK_SECRET) liveReadyIssues.push('MISSING_WEBHOOK_SECRET');
  if (
    !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE &&
    !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ) {
    liveReadyIssues.push('MISSING_PUBLISHABLE_KEY');
  }
  if (forceTest) liveReadyIssues.push('STRIPE_MODE_FORCES_TEST');

  const debug = {
    NODE_ENV: process.env.NODE_ENV,
    STRIPE_MODE: process.env.STRIPE_MODE ?? null,
    ROOT_URL,
    isLive,
    isTestMode,
    hasSTRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    hasSTRIPE_SECRET_KEY_TEST: !!process.env.STRIPE_SECRET_KEY_TEST,
    hasSTRIPE_SECRET_KEY_LIVE: !!process.env.STRIPE_SECRET_KEY_LIVE,
    hasSTRIPE_CLIENT_ID_TEST: !!process.env.STRIPE_CLIENT_ID_TEST,
    hasSTRIPE_CLIENT_ID_LIVE: !!process.env.STRIPE_CLIENT_ID_LIVE,
    hasSTRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
    hasNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    hasNEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE,
    isStripeConfigured: isStripeConfigured(),
    STRIPE_SECRET_KEY_PREFIX: process.env.STRIPE_SECRET_KEY?.substring(0, 12) || 'NOT_SET',
    STRIPE_SECRET_KEY_TEST_PREFIX: process.env.STRIPE_SECRET_KEY_TEST?.substring(0, 12) || 'NOT_SET',
    STRIPE_SECRET_KEY_LIVE_PREFIX: process.env.STRIPE_SECRET_KEY_LIVE?.substring(0, 12) || 'NOT_SET',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_PREFIX:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.substring(0, 12) || 'NOT_SET',
    expectedKeyType: isLive ? 'LIVE' : 'TEST',
    keySelectionIssue: isLive && !hasLiveSecret ? 'MISSING_LIVE_KEY' : 'OK',
    liveReady: liveReadyIssues.length === 0,
    liveReadyIssues,
    // Ops checklist: register these in Stripe Dashboard → Connect → Settings / Webhooks (Live)
    connectOAuthRedirectUri: `${ROOT_URL}/api/payments/connect/status`,
    legacyConnectOAuthRedirectUri: `${ROOT_URL}/api/stripe/callback`,
    webhookEndpoint: `${ROOT_URL}/api/stripe/webhook`,
    fallbackKeyType: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')
      ? 'LIVE'
      : process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
        ? 'TEST'
        : 'UNKNOWN',
  };

  return NextResponse.json(debug);
}
