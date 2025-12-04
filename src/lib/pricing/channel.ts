/**
 * @deprecated This file is kept for backward compatibility.
 * All pricing logic now uses getMatrixPriceForStay() from @/lib/pricing/matrix.ts
 * 
 * This wrapper maintains the old API signature but delegates to the shared pricing engine.
 */

import { getMatrixPriceForStay } from './matrix';

/**
 * Get price for stay - wrapper around shared pricing engine.
 * @deprecated Use getMatrixPriceForStay() directly from @/lib/pricing/matrix.ts
 */
export async function getPriceForStay(opts: {
  tenantId: string;
  seasonId?: string | null;
  ratePlanId?: string | null;
  channelCode: string;
  days: number;
}): Promise<number | null> {
  try {
    // Resolve product (same logic as engine.ts)
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const supabase = createAdminClient();

    let { data: standardProduct } = await supabase
      .from('products')
      .select('id')
      .eq('tenant_id', opts.tenantId)
      .eq('code', 'STANDARD')
      .eq('is_active', true)
      .maybeSingle();

    if (!standardProduct) {
      const { data: altProduct } = await supabase
        .from('products')
        .select('id')
        .eq('tenant_id', opts.tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      standardProduct = altProduct || null;
    }

    if (!standardProduct) {
      return null;
    }

    // Calculate date range from days (approximate - caller should provide startAt/endAt)
    const startAt = new Date().toISOString();
    const endAt = new Date(Date.now() + opts.days * 24 * 60 * 60 * 1000).toISOString();

    const result = await getMatrixPriceForStay({
      tenantId: opts.tenantId,
      productId: standardProduct.id,
      startAt,
      endAt,
      currency: 'GBP',
      channelCode: opts.channelCode,
    });

    return result.totalPrice;
  } catch (error) {
    console.error('Error in getPriceForStay wrapper:', error);
    return null;
  }
}

/**
 * Get extra day price (for stays beyond max defined days)
 * @deprecated This function may need to be refactored to use the shared pricing engine
 */
export async function getExtraDayPrice(opts: {
  tenantId: string;
  seasonId?: string | null;
  ratePlanId?: string | null;
  channelCode: string;
  maxDays: number;
}): Promise<number | null> {
  // For now, return null - this functionality should be handled by the LOS matrix
  // If needed, this should query pricing_rules with min_stay = maxDays + 1
  return null;
}
