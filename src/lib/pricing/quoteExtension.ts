// src/lib/pricing/quoteExtension.ts
import { createAdminClient } from '@/lib/supabase/server';
import { calculateStayDays } from './stayLength';

export async function quoteExtensionCents(opts: {
  tenantId: string;
  bookingEndAtISO: string; // current end
  newEndAtISO: string;     // proposed end
}): Promise<number> {
  const { tenantId, bookingEndAtISO, newEndAtISO } = opts;
  const supabase = createAdminClient();

  const start = new Date(bookingEndAtISO);
  const end = new Date(newEndAtISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    throw new Error("Invalid extension range");
  }

  // Use centralized stay length calculation
  const days = calculateStayDays(start, end);

  // 1) Try pricing_daily (per date) - if this table exists
  try {
    const { data: daily, error: dailyErr } = await supabase
      .from("pricing_daily")
      .select("day, price_cents")
      .gte("day", start.toISOString().slice(0,10))
      .lt("day", new Date(+start + days*86400000).toISOString().slice(0,10))
      .eq("tenant_id", tenantId);

    if (!dailyErr && daily && daily.length === days) {
      return daily.reduce((s: number, row: any) => s + (row.price_cents ?? 0), 0);
    }
  } catch (e) {
    // pricing_daily table doesn't exist, continue to fallback
  }

  // 2) Fallback to tenant_pricing
  try {
    const { data: pricing, error: pricingError } = await supabase
      .from("tenant_pricing")
      .select("daily_rate, minute_rate, billing_type")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    console.log(`[quoteExtension] tenant_pricing query result:`, { pricing, pricingError });

    const billingType = pricing?.billing_type || 'day';
    const diffMs = +end - +start;
    
    let amountCents: number;
    
    if (billingType === 'minute') {
      // Per-minute billing
      const minutes = Math.max(1, Math.ceil(diffMs / (1000 * 60)));
      const minuteRate = pricing?.minute_rate || (pricing?.daily_rate ? pricing.daily_rate / (24 * 60) : 10.0 / (24 * 60));
      const rateCents = Math.round(Number(minuteRate) * 100);
      amountCents = rateCents * minutes;
      console.log(`[quoteExtension] Using minute rate: £${minuteRate}/min = ${rateCents} cents/min`);
      console.log(`[quoteExtension] Total for ${minutes} minutes: ${amountCents} cents`);
    } else {
      // Per-day billing (default)
      const rateCents = Math.round((pricing?.daily_rate ?? 10.0) * 100); // Convert to cents, £10 fallback
      amountCents = rateCents * days;
      console.log(`[quoteExtension] Using daily rate: £${pricing?.daily_rate ?? 10.0}/day = ${rateCents} cents/day`);
      console.log(`[quoteExtension] Total for ${days} days: ${amountCents} cents`);
    }
    
    return amountCents;
  } catch (e) {
    console.log(`[quoteExtension] tenant_pricing table error, using fallback:`, e);
    // tenant_pricing table doesn't exist, use hardcoded fallback
    return 1000 * days; // £10 per day fallback
  }
}
