import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';

type TenantStripeKeys = {
  secretKey?: string;
  publishableKey?: string;
};

export async function getTenantStripeKeys(tenantId: string): Promise<TenantStripeKeys> {
  const sb = supabaseAdmin();
  
  // First try tenant_stripe table (preferred for Stripe Connect)
  const { data: stripeData, error: stripeError } = await sb
    .from('tenant_stripe')
    .select('stripe_publishable_key, stripe_secret_key')
    .eq('tenant_id', tenantId)
    .eq('connected', true)
    .single();

  if (!stripeError && stripeData) {
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
      return out;
    }
  }

  // Final fallback to platform env
  return {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  };
}

export async function getTenantStripeClient(tenantId: string) {
  const { secretKey } = await getTenantStripeKeys(tenantId);
  if (!secretKey) throw new Error('Stripe secret key missing for tenant');
  return new Stripe(secretKey, { apiVersion: '2025-08-27.basil' });
}
