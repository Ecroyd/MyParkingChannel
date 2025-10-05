import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';

type TenantStripeKeys = {
  secretKey?: string;
  publishableKey?: string;
};

export async function getTenantStripeKeys(tenantId: string): Promise<TenantStripeKeys> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('tenant_secrets')
    .select('key, value_ciphertext') // storing plaintext or pre-encrypted string
    .eq('tenant_id', tenantId);

  if (error) throw error;

  const out: TenantStripeKeys = {};
  data?.forEach(row => {
    if (row.key === 'stripe.secret_key') out.secretKey = row.value_ciphertext;
    if (row.key === 'stripe.publishable_key') out.publishableKey = row.value_ciphertext;
  });

  // Fallback to platform env if nothing set
  if (!out.secretKey) out.secretKey = process.env.STRIPE_SECRET_KEY;
  if (!out.publishableKey) out.publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  return out;
}

export async function getTenantStripeClient(tenantId: string) {
  const { secretKey } = await getTenantStripeKeys(tenantId);
  if (!secretKey) throw new Error('Stripe secret key missing for tenant');
  return new Stripe(secretKey, { apiVersion: '2024-06-20' });
}
