// lib/pricing.ts
import { getServerSupabase } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateStayDays } from './pricing/stayLength';

export async function getQuoteCents(tenantId: string, startAt: string, endAt: string): Promise<{ amount_cents: number, currency: string }> {
  // TODO: replace with your actual pricing logic:
  // - read rate_plans, pricing_rules, seasons, price_tiers, tenant_pricing, booking_rules (surcharges/blackouts)
  // - compute stay length + apply rules + return integer cents
  // For now we fall back to tenant_pricing.daily_rate * days or minute_rate * minutes:
  
  // Use admin client to bypass RLS for public operations
  const supabase = createAdminClient();
  const { data: tp } = await supabase
    .from('tenant_pricing')
    .select('daily_rate, minute_rate, billing_type, currency')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  
  const billingType = tp?.billing_type || 'day';
  const currency = (tp?.currency ?? 'GBP').toLowerCase();
  
  const start = new Date(startAt);
  const end = new Date(endAt);
  const diffMs = end.getTime() - start.getTime();
  
  let amount_cents: number;
  
  if (billingType === 'minute') {
    // Per-minute billing
    const minutes = Math.max(1, Math.ceil(diffMs / (1000 * 60)));
    const minuteRate = tp?.minute_rate || (tp?.daily_rate ? tp.daily_rate / (24 * 60) : 7.0 / (24 * 60));
    amount_cents = Math.round(Number(minuteRate) * 100 * minutes);
    console.log(`[getQuoteCents] Tenant: ${tenantId}, Minutes: ${minutes}, Rate: £${minuteRate}/min, Total: £${amount_cents/100}`);
  } else {
    // Per-day billing (default)
    // Use centralized stay length calculation
    const days = calculateStayDays(start, end);
    const dailyRate = tp?.daily_rate || 7.0; // £7 fallback rate
    amount_cents = Math.round(Number(dailyRate) * 100 * days);
    console.log(`[getQuoteCents] Tenant: ${tenantId}, Days: ${days}, Rate: £${dailyRate}/day, Total: £${amount_cents/100}`);
  }
  
  return { amount_cents, currency };
}
