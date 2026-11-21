// src/lib/promo/promoCodeStore.ts
//
// Database access for promo codes (service role). Callers check the session or tenant first.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePromoCode, type PromoCode } from './promoCodes';

export const PROMO_CODE_COLUMNS =
  'id, tenant_id, code, description, discount_type, discount_value, valid_from, valid_until, max_uses, min_spend, times_used, is_active, created_at, updated_at';

function toPromoCode(row: Record<string, unknown>): PromoCode {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    code: String(row.code),
    description: (row.description as string | null) ?? null,
    discount_type: row.discount_type === 'fixed' ? 'fixed' : 'percent',
    discount_value: Number(row.discount_value),
    valid_from: (row.valid_from as string | null) ?? null,
    valid_until: (row.valid_until as string | null) ?? null,
    max_uses: row.max_uses == null ? null : Number(row.max_uses),
    min_spend: row.min_spend == null ? null : Number(row.min_spend),
    times_used: Number(row.times_used ?? 0),
    is_active: Boolean(row.is_active),
  };
}

/** Find a tenant's code by what the customer typed (any case, spaces ignored). */
export async function findPromoCode(
  supabase: SupabaseClient,
  tenantId: string,
  typed: unknown
): Promise<PromoCode | null> {
  const code = normalizePromoCode(typed);
  if (!code) return null;
  const { data, error } = await supabase
    .from('promo_codes')
    .select(PROMO_CODE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('code', code)
    .maybeSingle();
  if (error) {
    console.error('[promo] lookup failed:', error);
    return null;
  }
  return data ? toPromoCode(data as Record<string, unknown>) : null;
}

/** Count one use of a code (called once a paid booking exists). Never throws. */
export async function recordPromoCodeUse(supabase: SupabaseClient, promoCodeId: string): Promise<void> {
  const { error } = await supabase.rpc('increment_promo_code_use', { p_promo_code_id: promoCodeId });
  if (error) console.error('[promo] failed to count use of', promoCodeId, error);
}
