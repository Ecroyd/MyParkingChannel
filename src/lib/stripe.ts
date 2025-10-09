// lib/stripe.ts
import Stripe from 'stripe';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`[config] Missing env: ${k}`);
  return v;
};

export const ROOT_URL = need('NEXT_PUBLIC_ROOT_URL');

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
if (!STRIPE_SECRET_KEY) {
  throw new Error('[config] Missing Stripe secret key. Set STRIPE_SECRET_KEY_TEST (dev) or STRIPE_SECRET_KEY_LIVE (prod)');
}

const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? '2025-09-30.clover';

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
});

export const useConnected = (acct: string) => {
  if (!acct) throw new Error('[stripe] Missing tenant stripe_account_id');
  return { stripeAccount: acct };
};
