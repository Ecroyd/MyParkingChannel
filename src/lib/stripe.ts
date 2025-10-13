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
  const isLive = process.env.NODE_ENV === 'production' || process.env.STRIPE_MODE === 'live';
  
  if (isLive) {
    return process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY;
  } else {
    return process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY;
  }
};

const STRIPE_SECRET_KEY = getStripeSecretKey();
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? '2025-09-30.clover';

// Create Stripe instance - use dummy key during builds if no real key is available
const stripeKey = STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build';
export const stripe = new Stripe(stripeKey, {
  apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
});

// Helper function to check if Stripe is configured
export const isStripeConfigured = () => !!STRIPE_SECRET_KEY;

export const useConnected = (acct: string) => {
  if (!acct) throw new Error('[stripe] Missing tenant stripe_account_id');
  return { stripeAccount: acct };
};
