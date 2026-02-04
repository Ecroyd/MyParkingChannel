import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';

type TenantStripeKeys = {
  secretKey?: string;
  publishableKey?: string;
};

function getPlatformStripeKeys(): TenantStripeKeys {
  const isLive = process.env.NODE_ENV === 'production' && process.env.STRIPE_MODE !== 'test';
  let secretKey: string | null = null;
  if (isLive) {
    secretKey = process.env.STRIPE_SECRET_KEY_LIVE ?? (process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? process.env.STRIPE_SECRET_KEY : null)
      ?? process.env.STRIPE_SECRET_KEY_TEST ?? (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? process.env.STRIPE_SECRET_KEY : null);
  } else {
    secretKey = process.env.STRIPE_SECRET_KEY_TEST ?? (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? process.env.STRIPE_SECRET_KEY : null) ?? process.env.STRIPE_SECRET_KEY ?? null;
  }
  const publishableKey = isLive
    ? (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    : (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  return { secretKey: secretKey ?? undefined, publishableKey: publishableKey ?? undefined };
}

// Rule set: Public/booking checkout always uses platform Stripe + Connect destination.
// Refunds use platform Stripe with stripeAccount (useConnected). Manual tenant keys only for legacy tenants where Connect isn't connected.
export async function getTenantStripeKeys(tenantId: string): Promise<TenantStripeKeys> {
  const sb = supabaseAdmin();
  const forceTestMode = process.env.STRIPE_MODE === 'test';

  if (!forceTestMode) {
    const { data: stripeRow, error: stripeError } = await sb
      .from('tenant_stripe')
      .select('connected, stripe_account_id, stripe_secret_key, stripe_publishable_key')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // 1) Connected → always use platform key (caller passes useConnected(accountId) for Connect operations)
    if (!stripeError && stripeRow?.connected === true && stripeRow?.stripe_account_id) {
      const platform = getPlatformStripeKeys();
      console.log('[TENANT STRIPE] path=Connect (platform key) tenant=', tenantId);
      return platform;
    }
    // 2) Legacy: tenant_stripe has own keys (manual/legacy; feature-flag in UI)
    if (!stripeError && stripeRow?.stripe_secret_key) {
      console.log('[TENANT STRIPE] path=legacy tenant_stripe tenant=', tenantId);
      return {
        secretKey: stripeRow.stripe_secret_key,
        publishableKey: stripeRow.stripe_publishable_key ?? undefined,
      };
    }
  }

  // 3) Legacy: tenant_secrets
  const { data: secretsData, error: secretsError } = await sb
    .from('tenant_secrets')
    .select('key, value_ciphertext')
    .eq('tenant_id', tenantId);

  if (!secretsError && secretsData?.length) {
    const out: TenantStripeKeys = {};
    secretsData.forEach((row: { key: string; value_ciphertext: string }) => {
      if (row.key === 'stripe.secret_key') out.secretKey = row.value_ciphertext;
      if (row.key === 'stripe.publishable_key') out.publishableKey = row.value_ciphertext;
    });
    if (out.secretKey || out.publishableKey) {
      console.log('[TENANT STRIPE] path=legacy tenant_secrets tenant=', tenantId);
      return out;
    }
  }

  // 4) Platform fallback
  const platform = getPlatformStripeKeys();
  console.log('[TENANT STRIPE] path=platform fallback tenant=', tenantId);
  return platform;
}

const PINNED_STRIPE_API_VERSION = '2025-08-27.basil';

export async function getTenantStripeClient(tenantId: string) {
  const { secretKey } = await getTenantStripeKeys(tenantId);
  if (!secretKey) throw new Error('Stripe secret key missing for tenant');
  return new Stripe(secretKey, { apiVersion: PINNED_STRIPE_API_VERSION as Stripe.LatestApiVersion });
}
