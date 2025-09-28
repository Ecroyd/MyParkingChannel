// src/lib/pricing/quoteExtension.ts
import { getServerSupabase } from '@/lib/supabase/server';

export async function quoteExtensionCents(opts: {
  tenantId: string;
  bookingEndAtISO: string; // current end
  newEndAtISO: string;     // proposed end
}): Promise<number> {
  const { tenantId, bookingEndAtISO, newEndAtISO } = opts;
  const supabase = getServerSupabase({ admin: true });

  const start = new Date(bookingEndAtISO);
  const end = new Date(newEndAtISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    throw new Error("Invalid extension range");
  }

  const days = Math.max(1, Math.ceil((+end - +start) / 86400000));

  // 1) Try pricing_daily (per date) - if this table exists
  try {
    const { data: daily, error: dailyErr } = await supabase
      .from("pricing_daily")
      .select("day, price_cents")
      .gte("day", start.toISOString().slice(0,10))
      .lt("day", new Date(+start + days*86400000).toISOString().slice(0,10))
      .eq("tenant_id", tenantId);

    if (!dailyErr && daily && daily.length === days) {
      return daily.reduce((s,row) => s + (row.price_cents ?? 0), 0);
    }
  } catch (e) {
    // pricing_daily table doesn't exist, continue to fallback
  }

  // 2) Fallback to tenant_pricing.daily_rate
  try {
    const { data: pricing, error: pricingError } = await supabase
      .from("tenant_pricing")
      .select("daily_rate")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    console.log(`[quoteExtension] tenant_pricing query result:`, { pricing, pricingError });

    const rateCents = Math.round((pricing?.daily_rate ?? 10.0) * 100); // Convert to cents, £10 fallback
    console.log(`[quoteExtension] Using daily rate: ${pricing?.daily_rate ?? 10.0} GBP = ${rateCents} cents per day`);
    console.log(`[quoteExtension] Total for ${days} days: ${rateCents * days} cents`);
    
    return rateCents * days;
  } catch (e) {
    console.log(`[quoteExtension] tenant_pricing table error, using fallback:`, e);
    // tenant_pricing table doesn't exist, use hardcoded fallback
    return 1000 * days; // £10 per day fallback
  }
}
