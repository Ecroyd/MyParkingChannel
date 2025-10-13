// Debug endpoint to check Stripe configuration
import { NextResponse } from 'next/server';
import { isStripeConfigured } from '@/lib/stripe';

export async function GET() {
  const isLive = process.env.NODE_ENV === 'production' || process.env.STRIPE_MODE === 'live';
  const isTestMode = process.env.STRIPE_MODE === 'test';
  
  const debug = {
    NODE_ENV: process.env.NODE_ENV,
    STRIPE_MODE: process.env.STRIPE_MODE,
    isLive,
    isTestMode,
    hasSTRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
    hasSTRIPE_SECRET_KEY_TEST: !!process.env.STRIPE_SECRET_KEY_TEST,
    hasSTRIPE_SECRET_KEY_LIVE: !!process.env.STRIPE_SECRET_KEY_LIVE,
    isStripeConfigured: isStripeConfigured(),
    // Don't expose actual keys, just show if they exist and their prefixes
    STRIPE_SECRET_KEY_PREFIX: process.env.STRIPE_SECRET_KEY?.substring(0, 12) || 'NOT_SET',
    STRIPE_SECRET_KEY_TEST_PREFIX: process.env.STRIPE_SECRET_KEY_TEST?.substring(0, 12) || 'NOT_SET',
    STRIPE_SECRET_KEY_LIVE_PREFIX: process.env.STRIPE_SECRET_KEY_LIVE?.substring(0, 12) || 'NOT_SET',
    // Show which key would be selected
    expectedKeyType: isLive ? 'LIVE' : 'TEST',
    keySelectionIssue: isLive && !process.env.STRIPE_SECRET_KEY_LIVE ? 'MISSING_LIVE_KEY' : 'OK',
    // Check if fallback key is the right type
    fallbackKeyType: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'LIVE' : 
                    process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN',
  };

  return NextResponse.json(debug);
}
