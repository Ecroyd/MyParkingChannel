// lib/supabase-server.ts
import { getServerSupabase as getServerSupabaseFromLib } from './supabase/server';

export async function getServerSupabase() {
  return getServerSupabaseFromLib();
}

export async function getAuthedUserTenantId() {
  const supabase = await getServerSupabase();
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
  // Use admin client to bypass RLS for public operations
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('tenant_stripe')
    .select('stripe_account_id, connected')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw error;
  return { accountId: data?.stripe_account_id ?? null, connected: !!data?.connected };
}

export async function setTenantStripeAccountId(tenantId: string, accountId: string, connected = false) {
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from('tenant_stripe')
    .upsert({ tenant_id: tenantId, stripe_account_id: accountId, connected, updated_at: new Date().toISOString() });
  if (error) throw error;
}
