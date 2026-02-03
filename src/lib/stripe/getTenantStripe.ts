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

export async function getTenantStripeKeys(tenantId: string): Promise<TenantStripeKeys> {
  const sb = supabaseAdmin();
  const forceTestMode = process.env.STRIPE_MODE === 'test';

  // 1) Connect: tenant_stripe.connected + stripe_account_id → always use platform key (checkout uses platform + useConnected(accountId))
  if (!forceTestMode) {
    const { data: stripeRow, error: stripeError } = await sb
      .from('tenant_stripe')
      .select('connected, stripe_account_id, stripe_secret_key, stripe_publishable_key')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!stripeError && stripeRow?.connected && stripeRow?.stripe_account_id) {
      const platform = getPlatformStripeKeys();
      console.log('[TENANT STRIPE] Using Connect (platform key) for tenant:', tenantId);
      return platform;
    }
    // 2) Legacy: tenant_stripe has own secret key (manual keys stored on row)
    if (!stripeError && stripeRow?.stripe_secret_key) {
      console.log('[TENANT STRIPE] Using legacy tenant keys (tenant_stripe) for tenant:', tenantId);
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
      console.log('[TENANT STRIPE] Using legacy tenant keys (tenant_secrets) for tenant:', tenantId);
      return out;
    }
  }

  // 4) Platform fallback
  const platform = getPlatformStripeKeys();
  console.log('[TENANT STRIPE] Using platform fallback for tenant:', tenantId);
  return platform;
}

const PINNED_STRIPE_API_VERSION = '2025-08-27.basil';

export async function getTenantStripeClient(tenantId: string) {
  const { secretKey } = await getTenantStripeKeys(tenantId);
  if (!secretKey) throw new Error('Stripe secret key missing for tenant');
  return new Stripe(secretKey, { apiVersion: PINNED_STRIPE_API_VERSION as Stripe.LatestApiVersion });
}
