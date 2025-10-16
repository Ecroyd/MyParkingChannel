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
  
  // Calculate days
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(1, Math.ceil((new Date(endAt).getTime() - new Date(startAt).getTime()) / dayMs));
  
  // Use pricing data if available, otherwise use fallback
  const dailyRate = tp?.daily_rate || 7.0; // £7 fallback rate
  const currency = (tp?.currency ?? 'GBP').toLowerCase();
  const amount_cents = Math.round(Number(dailyRate) * 100 * days);
  
  console.log(`[getQuoteCents] Tenant: ${tenantId}, Days: ${days}, Rate: £${dailyRate}, Total: £${amount_cents/100}`);
  
  return { amount_cents, currency };
}
