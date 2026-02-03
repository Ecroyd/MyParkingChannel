// lib/stripe.ts
import Stripe from 'stripe';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`[config] Missing env: ${k}`);
  return v;
};

// Handle ROOT_URL more gracefully during builds
export const ROOT_URL = process.env.NEXT_PUBLIC_ROOT_URL || 'http://localhost:3000';

// Handle both test and live keys
const getStripeSecretKey = () => {
  // Force test mode if STRIPE_MODE=test is set, even in production
  const isLive = process.env.NODE_ENV === 'production' && process.env.STRIPE_MODE !== 'test';
  const isTestMode = process.env.STRIPE_MODE === 'test' || process.env.NODE_ENV !== 'production';
  
  console.log('🔍 [STRIPE] Environment check:', {
    NODE_ENV: process.env.NODE_ENV,
    STRIPE_MODE: process.env.STRIPE_MODE,
    isLive,
    isTestMode,
    hasSTRIPE_SECRET_KEY_LIVE: !!process.env.STRIPE_SECRET_KEY_LIVE,
    hasSTRIPE_SECRET_KEY_TEST: !!process.env.STRIPE_SECRET_KEY_TEST,
    hasSTRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY
  });
  
  if (isLive) {
    // In production, prioritize live keys but allow test keys for testing
    const liveKey = process.env.STRIPE_SECRET_KEY_LIVE;
    const testKey = process.env.STRIPE_SECRET_KEY_TEST;
    const fallbackKey = process.env.STRIPE_SECRET_KEY;
    
    if (liveKey) {
      console.log('🔍 [STRIPE] Using live key:', `${liveKey.substring(0, 12)}...`);
      return liveKey;
    } else if (fallbackKey && fallbackKey.startsWith('sk_live_')) {
      console.log('🔍 [STRIPE] Using fallback live key:', `${fallbackKey.substring(0, 12)}...`);
      return fallbackKey;
    } else if (testKey) {
      console.log('🔍 [STRIPE] Using test key in production (testing mode):', `${testKey.substring(0, 12)}...`);
      return testKey;
    } else if (fallbackKey && fallbackKey.startsWith('sk_test_')) {
      console.log('🔍 [STRIPE] Using fallback test key in production (testing mode):', `${fallbackKey.substring(0, 12)}...`);
      return fallbackKey;
    } else {
      console.error('❌ [STRIPE] No valid key found! Available keys:', {
        hasSTRIPE_SECRET_KEY_LIVE: !!process.env.STRIPE_SECRET_KEY_LIVE,
        hasSTRIPE_SECRET_KEY_TEST: !!process.env.STRIPE_SECRET_KEY_TEST,
        hasSTRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
        fallbackKeyPrefix: fallbackKey?.substring(0, 12) || 'NOT_SET'
      });
      return null;
    }
  } else {
    // In development, use test keys
    const testKey = process.env.STRIPE_SECRET_KEY_TEST;
    const fallbackKey = process.env.STRIPE_SECRET_KEY;
    
    if (testKey) {
      console.log('🔍 [STRIPE] Using test key:', `${testKey.substring(0, 12)}...`);
      return testKey;
    } else if (fallbackKey && fallbackKey.startsWith('sk_test_')) {
      console.log('🔍 [STRIPE] Using fallback test key:', `${fallbackKey.substring(0, 12)}...`);
      return fallbackKey;
    } else {
      console.log('🔍 [STRIPE] Using fallback key:', fallbackKey ? `${fallbackKey.substring(0, 12)}...` : 'NOT FOUND');
      return fallbackKey;
    }
  }
};

const STRIPE_SECRET_KEY = getStripeSecretKey();
// Pinned default; only bump deliberately (release task). Set STRIPE_API_VERSION in env to override.
const STRIPE_API_VERSION_PINNED = '2025-09-30.clover';
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? STRIPE_API_VERSION_PINNED;

// Create Stripe instance - use dummy key during builds if no real key is available
const stripeKey = STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build';

console.log('[STRIPE] API version =', STRIPE_API_VERSION);
console.log('🔍 [STRIPE] Final key being used:', {
  hasRealKey: !!STRIPE_SECRET_KEY,
  keyPrefix: stripeKey.substring(0, 12),
  isDummyKey: stripeKey === 'sk_test_dummy_key_for_build',
  isLiveKey: stripeKey.startsWith('sk_live_'),
  isTestKey: stripeKey.startsWith('sk_test_'),
  apiVersion: STRIPE_API_VERSION
});

// Warn if using test key in production
if (process.env.NODE_ENV === 'production' && stripeKey.startsWith('sk_test_')) {
  if (process.env.STRIPE_MODE === 'test') {
    console.log('✅ [STRIPE] Using test key in production (explicit test mode). This is intentional for testing.');
  } else {
    console.warn('⚠️ [STRIPE] Using test key in production (testing mode). This is OK for testing but will not work with real payments.');
  }
}

export const stripe = new Stripe(stripeKey, {
  apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
});

// Helper function to check if Stripe is configured
export const isStripeConfigured = () => !!STRIPE_SECRET_KEY;

export const useConnected = (acct: string) => {
  if (!acct) throw new Error('[stripe] Missing tenant stripe_account_id');
  return { stripeAccount: acct };
};
