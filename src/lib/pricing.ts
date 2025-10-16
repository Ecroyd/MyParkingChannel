// lib/pricing.ts
import { getServerSupabase } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function getQuoteCents(tenantId: string, startAt: string, endAt: string): Promise<{ amount_cents: number, currency: string }> {
  // TODO: replace with your actual pricing logic:
  // - read rate_plans, pricing_rules, seasons, price_tiers, tenant_pricing, booking_rules (surcharges/blackouts)
  // - compute stay length + apply rules + return integer cents
  // For now we fall back to tenant_pricing.daily_rate * days:
  
  // Use admin client to bypass RLS for public operations
  const supabase = createAdminClient();
  const { data: tp } = await supabase.from('tenant_pricing').select('daily_rate, currency').eq('tenant_id', tenantId).maybeSingle();
  if (!tp?.daily_rate) throw new Error('No tenant_pricing found');
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(1, Math.ceil((new Date(endAt).getTime() - new Date(startAt).getTime()) / dayMs));
  const amount_cents = Math.round(Number(tp.daily_rate) * 100 * days);
  const currency = (tp.currency ?? 'GBP').toLowerCase();
  return { amount_cents, currency };
}
