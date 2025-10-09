// lib/stripe.ts
import Stripe from 'stripe';

const required = (name: string, val?: string) => {
  if (!val) throw new Error(`[config] Missing ${name}. Set ${name} in your env.`);
  return val;
};

export const STRIPE_API_VERSION = '2025-09-30.clover'; // per your request

export const ROOT_URL = required('NEXT_PUBLIC_ROOT_URL', process.env.NEXT_PUBLIC_ROOT_URL);
const SECRET_KEY = required('STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY);

export const stripe = new Stripe(SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion, // keeps TS happy
});

/**
 * Helper to ensure we always pass Stripe-Account header where required.
 */
export const asConnected = (stripeAccount: string) => {
  if (!stripeAccount) throw new Error('[stripe] Missing connected account id (acct_...).');
  return { stripeAccount };
};
