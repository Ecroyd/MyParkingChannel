// lib/stripe.ts
import Stripe from 'stripe';

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`[config] Missing env: ${k}`);
  return v;
};

export const ROOT_URL = need('NEXT_PUBLIC_ROOT_URL');
const STRIPE_SECRET_KEY = need('STRIPE_SECRET_KEY');
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION ?? '2025-09-30.clover';

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
});

export const useConnected = (acct: string) => {
  if (!acct) throw new Error('[stripe] Missing tenant stripe_account_id');
  return { stripeAccount: acct };
};
