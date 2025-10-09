// lib/supabase-server.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export function getServerSupabase() {
  const cookieStore = cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // if you already have RLS-safe helpers, use those instead
  if (!url || !key) throw new Error('[config] Missing Supabase server creds');
  return createServerClient(url, key, {
    cookies: {
      get: (name) => cookieStore.get(name)?.value,
    },
  });
}

export async function getAuthedUserTenantId() {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Use the user's default tenant
  const { data, error } = await supabase
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_default', true)
    .maybeSingle();

  if (error) throw error;
  if (!data?.tenant_id) throw new Error('No default tenant found; pass ?tenantId=');
  return data.tenant_id as string;
}

export async function getTenantStripeAccountId(tenantId: string) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('tenant_stripe')
    .select('stripe_account_id, connected')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw error;
  return { accountId: data?.stripe_account_id ?? null, connected: !!data?.connected };
}

export async function setTenantStripeAccountId(tenantId: string, accountId: string, connected = false) {
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from('tenant_stripe')
    .upsert({ tenant_id: tenantId, stripe_account_id: accountId, connected, updated_at: new Date().toISOString() });
  if (error) throw error;
}
