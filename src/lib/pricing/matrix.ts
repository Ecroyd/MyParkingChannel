// src/lib/pricing/matrix.ts

// Single source of truth for LOS matrix pricing (pricing_rules + price_tiers)
// NO fallbacks to tenant_pricing or hardcoded values

import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateStayDays } from './stayLength';

const DAY_MS = 1000 * 60 * 60 * 24;

export type PricingSource = {
  table: string;
  ratePlanId?: string | null;
  ratePlanName: string;
  totalPrice: number;
  pricePerDay: number; // derived for debug only
  seasonId?: string | null;
  channelCode?: string | null;
  pricingRuleId?: string;
  tierId?: string;
  tierType?: string;
  tierValue?: number;
  days: number;
};

export type MatrixPriceResult = {
  totalPrice: number;
  pricePerDay: number;
  ratePlanName: string;
  source: PricingSource;
};

/**
 * Generate a list of dates (YYYY-MM-DD) covering the stay (inclusive)
 */
function generateStayDates(startAt: string, endAt: string): string[] {
  const start = new Date(startAt);
  const end = new Date(endAt);

  // Normalise both to UTC midnight
  const startUTC = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  const dates: string[] = [];
  let cursor = startUTC.getTime();

  // Guard: if end is before start, clamp to start
  if (endUTC.getTime() < startUTC.getTime()) {
    endUTC.setTime(startUTC.getTime());
  }

  while (cursor <= endUTC.getTime()) {
    const d = new Date(cursor);
    dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    cursor += DAY_MS;
  }

  return dates;
}

/**
 * Find season ID that covers a given date (first day of stay)
 */
export async function findSeasonForDate(
  supabase: SupabaseClient,
  tenantId: string,
  firstDate: string
): Promise<string | null> {
  const { data: seasonRanges, error } = await supabase
    .from('season_ranges')
    .select('season_id, range')
    .eq('tenant_id', tenantId);

  if (error || !seasonRanges || seasonRanges.length === 0) {
    return null;
  }

  for (const sr of seasonRanges) {
    const rangeStr = sr.range as unknown as string;
    // daterange format: [start,end) or (start,end)
    const match = rangeStr.match(/^[\[\(]([^,]+),([^,\)]+)[\)\]]$/);
    if (!match) continue;

    const rangeStart = match[1];
    const rangeEnd = match[2];

    if (firstDate >= rangeStart && firstDate < rangeEnd) {
      return sr.season_id as string;
    }
  }

  return null;
}

/**
 * Get total price for stay from LOS matrix (pricing_rules + price_tiers).
 * This is the ONLY source of base pricing (no daily-rate fallback).
 *
 * Rules:
 * - price_tiers.value = TOTAL price for this stay length (days).
 * - One matrix per season for channel='all'.
 * - Per-channel overrides only where needed.
 * - Throws error if no pricing rule is found (no fallbacks).
 */
export async function getMatrixPriceForStay(params: {
  tenantId: string;
  productId: string;
  startAt: string;
  endAt: string;
  currency: string;
  channelCode?: string;
}): Promise<MatrixPriceResult> {
  const { tenantId, productId, startAt, endAt, currency, channelCode } = params;

  const supabase = createAdminClient();
  const stayDates = generateStayDates(startAt, endAt);
  const firstDate = stayDates[0];
  
  // Use centralized stay length calculation (time-based, not calendar-based)
  const startAtDate = new Date(startAt);
  const endAtDate = new Date(endAt);
  const days = calculateStayDays(startAtDate, endAtDate);
  
  console.log("[PRICING] stay", {
    startAt: startAtDate.toISOString(),
    endAt: endAtDate.toISOString(),
    days,
  });
  
  const effectiveChannelCode = channelCode || 'agent';

  // 1) Find season for the first date
  const seasonId = await findSeasonForDate(supabase, tenantId, firstDate);

  // 2) Query pricing_rules matching this LOS + season
  let q = supabase
    .from('pricing_rules')
    .select(
      `
      id,
      tenant_id,
      rate_plan_id,
      season_id,
      tier_id,
      channel,
      min_stay,
      max_stay,
      priority,
      is_active,
      created_at
    `
    )
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    // LOS constraints: min_stay <= days <= max_stay (where max_stay may be null)
    .lte('min_stay', days)
    .or(`max_stay.is.null,max_stay.gte.${days}`);

  if (seasonId) {
    q = q.eq('season_id', seasonId);
  } else {
    q = q.is('season_id', null);
  }

  // TEMP: ignore rate_plan filter so master matrix works per tenant+season+channel only
  // We'll bring rate_plan-specific pricing back later if we really need it.
  // pricingRulesQuery = pricingRulesQuery.or(
  //   `rate_plan_id.is.null,rate_plan_id.eq.${ratePlanId}`
  // );

  const { data: allRules, error: rulesError } = await q
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true });

  if (rulesError) {
    console.error('[PRICING] Error querying pricing_rules:', rulesError);
    throw new Error(`Failed to query pricing rules: ${rulesError.message || JSON.stringify(rulesError)}`);
  }

  if (!allRules || allRules.length === 0) {
    throw new Error('No pricing rules found for this stay. Please configure LOS matrix in the Pricing UI.');
  }

  // 4) Filter by channel and apply precedence.
  // Precedence: channel-specific > 'agent' > 'all' > null
  const rulesForExactLOS = allRules.filter(
    (r: any) => r.min_stay === days && (r.max_stay === null || r.max_stay === days)
  );

  const candidateSet = rulesForExactLOS.length > 0 ? rulesForExactLOS : allRules;

  const byChannel = (code: string | null) =>
    candidateSet.filter((r: any) => (code === null ? !r.channel : r.channel === code));

  let selectedRule: any =
    byChannel(effectiveChannelCode)[0] ??
    byChannel('agent')[0] ??
    byChannel('all')[0] ??
    byChannel(null)[0];

  if (!selectedRule) {
    // Fallback: first rule by priority
    selectedRule = candidateSet[0];
  }

  console.log("[PRICING] matrix row selected", {
    ruleId: selectedRule?.id,
    minStay: selectedRule?.min_stay,
    maxStay: selectedRule?.max_stay,
    channel: selectedRule?.channel,
    seasonId: selectedRule?.season_id,
    tierId: selectedRule?.tier_id,
    days,
  });

  // 5) Load price tier for selected rule
  const { data: tier, error: tierError } = await supabase
    .from('price_tiers')
    .select('id, type, value, code, label')
    .eq('id', selectedRule.tier_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (tierError || !tier) {
    console.error('[PRICING] Error getting price_tier:', tierError);
    throw new Error(`Failed to get price tier for rule ${selectedRule.id}: ${tierError?.message || 'Tier not found'}`);
  }

  const tierValue = Number(tier.value);
  if (isNaN(tierValue) || tierValue <= 0) {
    throw new Error(`Invalid tier value: ${tier.value}`);
  }

  // Interpretation:
  // - For this project, tier.value = TOTAL price for the stay (non-linear LOS matrix).
  // - tier.type is kept for future use but does not change the calculation here.
  const totalPrice = tierValue;
  const pricePerDay = totalPrice / days;

  return {
    totalPrice,
    pricePerDay,
    ratePlanName: 'standard', // Not using product_rate_plans
    source: {
      table: 'pricing_rules',
      ratePlanId: null, // Not using product_rate_plans
      ratePlanName: 'standard',
      totalPrice,
      pricePerDay,
      seasonId: selectedRule.season_id,
      channelCode: selectedRule.channel || effectiveChannelCode,
      pricingRuleId: selectedRule.id,
      tierId: selectedRule.tier_id,
      tierType: tier.type,
      tierValue,
      days,
    },
  };
}

