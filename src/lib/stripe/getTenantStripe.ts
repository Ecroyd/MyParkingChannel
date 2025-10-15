import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';

type TenantStripeKeys = {
  secretKey?: string;
  publishableKey?: string;
};

export async function getTenantStripeKeys(tenantId: string): Promise<TenantStripeKeys> {
  const sb = supabaseAdmin();
  
  // Check if we should force test mode
  const forceTestMode = process.env.STRIPE_MODE === 'test';
  
  console.log('🔍 [TENANT STRIPE] Getting keys for tenant:', tenantId, {
    forceTestMode,
    STRIPE_MODE: process.env.STRIPE_MODE,
    NODE_ENV: process.env.NODE_ENV
  });
  
  // If forcing test mode, skip database lookup and use environment variables
  if (forceTestMode) {
    console.log('🔍 [TENANT STRIPE] Forcing test mode - skipping database lookup');
    // Skip to environment variable fallback
  } else {
    // First try tenant_stripe table (preferred for Stripe Connect)
    const { data: stripeData, error: stripeError } = await sb
      .from('tenant_stripe')
      .select('stripe_publishable_key, stripe_secret_key')
      .eq('tenant_id', tenantId)
      .eq('connected', true)
      .single();

    if (!stripeError && stripeData) {
      console.log('🔍 [TENANT STRIPE] Using database keys from tenant_stripe table');
      return {
        secretKey: stripeData.stripe_secret_key,
        publishableKey: stripeData.stripe_publishable_key
      };
    }

    // Fallback to tenant_secrets table (legacy)
    const { data: secretsData, error: secretsError } = await sb
      .from('tenant_secrets')
      .select('key, value_ciphertext')
      .eq('tenant_id', tenantId);

    if (!secretsError && secretsData) {
      const out: TenantStripeKeys = {};
      secretsData.forEach((row: any) => {
        if (row.key === 'stripe.secret_key') out.secretKey = row.value_ciphertext;
        if (row.key === 'stripe.publishable_key') out.publishableKey = row.value_ciphertext;
      });
      
      if (out.secretKey || out.publishableKey) {
        console.log('🔍 [TENANT STRIPE] Using database keys from tenant_secrets table');
        return out;
      }
    }
  }

  // Final fallback to platform env - use same logic as main Stripe config
  const getStripeSecretKey = () => {
    // Force test mode if STRIPE_MODE=test is set, even in production
    const isLive = process.env.NODE_ENV === 'production' && process.env.STRIPE_MODE !== 'test';
    const isTestMode = process.env.STRIPE_MODE === 'test' || process.env.NODE_ENV !== 'production';
    
    if (isLive) {
      // In production, prioritize live keys but allow test keys for testing
      const liveKey = process.env.STRIPE_SECRET_KEY_LIVE;
      const testKey = process.env.STRIPE_SECRET_KEY_TEST;
      const fallbackKey = process.env.STRIPE_SECRET_KEY;
      
      if (liveKey) {
        return liveKey;
      } else if (fallbackKey && fallbackKey.startsWith('sk_live_')) {
        return fallbackKey;
      } else if (testKey) {
        console.log('🔍 [STRIPE] Using test key in production (testing mode) for tenant:', `${testKey.substring(0, 12)}...`);
        return testKey;
      } else if (fallbackKey && fallbackKey.startsWith('sk_test_')) {
        console.log('🔍 [STRIPE] Using fallback test key in production (testing mode) for tenant:', `${fallbackKey.substring(0, 12)}...`);
        return fallbackKey;
      } else {
        return null;
      }
    } else {
      // In development, use test keys
      const testKey = process.env.STRIPE_SECRET_KEY_TEST;
      const fallbackKey = process.env.STRIPE_SECRET_KEY;
      
      if (testKey) {
        return testKey;
      } else if (fallbackKey && fallbackKey.startsWith('sk_test_')) {
        return fallbackKey;
      } else {
        return fallbackKey;
      }
    }
  };

  const getStripePublishableKey = () => {
    const isLive = process.env.NODE_ENV === 'production' && process.env.STRIPE_MODE !== 'test';
    
    if (isLive) {
      return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    } else {
      return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    }
  };

  const secretKey = getStripeSecretKey();
  const publishableKey = getStripePublishableKey();
  
  console.log('🔍 [TENANT STRIPE] Final key selection:', {
    secretKeyPrefix: secretKey?.substring(0, 12) || 'NOT_SET',
    isTestKey: secretKey?.startsWith('sk_test_'),
    isLiveKey: secretKey?.startsWith('sk_live_'),
    publishableKeyPrefix: publishableKey?.substring(0, 12) || 'NOT_SET'
  });

  return {
    secretKey,
    publishableKey
  };
}

export async function getTenantStripeClient(tenantId: string) {
  const { secretKey } = await getTenantStripeKeys(tenantId);
  
  console.log('🔍 [TENANT STRIPE] Key selection for tenant:', tenantId, {
    hasSecretKey: !!secretKey,
    keyPrefix: secretKey?.substring(0, 12) || 'NOT_SET',
    isLiveKey: secretKey?.startsWith('sk_live_'),
    isTestKey: secretKey?.startsWith('sk_test_'),
    NODE_ENV: process.env.NODE_ENV,
    STRIPE_MODE: process.env.STRIPE_MODE
  });
  
  if (!secretKey) throw new Error('Stripe secret key missing for tenant');
  return new Stripe(secretKey, { apiVersion: '2025-08-27.basil' });
}
