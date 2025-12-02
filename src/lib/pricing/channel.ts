/**
 * Pricing helper that supports channel-specific rules with fallback
 * Precedence: channel-specific > 'all' > null
 */
import { createAdminClient } from '@/lib/supabase/admin';

export async function getPriceForStay(opts: {
  tenantId: string;
  seasonId?: string | null;
  ratePlanId?: string | null;
  channelCode: string; // e.g. 'cavu', 'holiday_extras', 'web', 'direct'
  days: number;
}): Promise<number | null> {
  const { tenantId, seasonId, ratePlanId, channelCode, days } = opts;
  const supabase = createAdminClient();

  // Build query for pricing rules
  let query = supabase
    .from('pricing_rules')
    .select(`
      id,
      min_stay,
      max_stay,
      channel,
      tier_id,
      priority,
      is_active,
      price_tiers (
        id,
        value,
        type
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .lte('min_stay', days)
    .or(`max_stay.is.null,max_stay.gte.${days}`);

  if (seasonId) {
    query = query.eq('season_id', seasonId);
  } else {
    query = query.is('season_id', null);
  }

  if (ratePlanId) {
    query = query.eq('rate_plan_id', ratePlanId);
  } else {
    query = query.is('rate_plan_id', null);
  }

  const { data: allRules, error } = await query;

  if (error) {
    console.error('Error querying pricing rules:', error);
    return null;
  }

  if (!allRules || allRules.length === 0) {
    return null;
  }

  // Partition by channel precedence
  const byChannel = allRules.filter(
    (r) => r.channel === channelCode && r.min_stay === days && (r.max_stay === null || r.max_stay === days)
  );
  const byAgent = allRules.filter(
    (r) => r.channel === 'agent' && r.min_stay === days && (r.max_stay === null || r.max_stay === days)
  );
  const byAll = allRules.filter(
    (r) => r.channel === 'all' && r.min_stay === days && (r.max_stay === null || r.max_stay === days)
  );
  const byNull = allRules.filter(
    (r) => !r.channel && r.min_stay === days && (r.max_stay === null || r.max_stay === days)
  );

  // Precedence: channel-specific first, then 'agent', then 'all', then null
  const activeSet = byChannel.length > 0 
    ? byChannel 
    : byAgent.length > 0 
    ? byAgent 
    : byAll.length > 0 
    ? byAll 
    : byNull;

  // Sort by priority (lower number = higher priority)
  if (activeSet.length > 0) {
    activeSet.sort((a, b) => (a.priority || 100) - (b.priority || 100));

    // Get the first matching rule's tier value
    const rule = activeSet[0];
    // price_tiers is returned as an array from Supabase join, get first element
    const tier = Array.isArray(rule.price_tiers) 
      ? rule.price_tiers[0] 
      : rule.price_tiers;
    if (tier && tier.value) {
      return parseFloat(tier.value.toString());
    }
  }

  // If no pricing found in any channel, return null (caller should fallback to tenant_pricing)
  return null;
}

/**
 * Get extra day price (for stays beyond max defined days)
 */
export async function getExtraDayPrice(opts: {
  tenantId: string;
  seasonId?: string | null;
  ratePlanId?: string | null;
  channelCode: string;
  maxDays: number;
}): Promise<number | null> {
  const { tenantId, seasonId, ratePlanId, channelCode, maxDays } = opts;
  const supabase = createAdminClient();

  let query = supabase
    .from('pricing_rules')
    .select(`
      id,
      min_stay,
      max_stay,
      channel,
      priority,
      is_active,
      price_tiers (
        id,
        value,
        type
      )
    `)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .eq('min_stay', maxDays + 1)
    .is('max_stay', null);

  if (seasonId) {
    query = query.eq('season_id', seasonId);
  } else {
    query = query.is('season_id', null);
  }

  if (ratePlanId) {
    query = query.eq('rate_plan_id', ratePlanId);
  } else {
    query = query.is('rate_plan_id', null);
  }

  const { data: allRules, error } = await query;

  if (error) {
    console.error('Error querying extra day pricing rules:', error);
    return null;
  }

  if (!allRules || allRules.length === 0) {
    return null;
  }

  // Partition by channel precedence
  const byChannel = allRules.filter((r) => r.channel === channelCode);
  const byAgent = allRules.filter((r) => r.channel === 'agent');
  const byAll = allRules.filter((r) => r.channel === 'all');
  const byNull = allRules.filter((r) => !r.channel);

  // Precedence: channel-specific first, then 'agent', then 'all', then null
  const activeSet = byChannel.length > 0 
    ? byChannel 
    : byAgent.length > 0 
    ? byAgent 
    : byAll.length > 0 
    ? byAll 
    : byNull;

  // Sort by priority (lower number = higher priority)
  if (activeSet.length > 0) {
    activeSet.sort((a, b) => (a.priority || 100) - (b.priority || 100));
    const rule = activeSet[0];
    // price_tiers is returned as an array from Supabase join, get first element
    const tier = Array.isArray(rule.price_tiers) 
      ? rule.price_tiers[0] 
      : rule.price_tiers;
    if (tier && tier.value) {
      return parseFloat(tier.value.toString());
    }
  }

  // If no pricing found in any channel, return null (caller should fallback to tenant_pricing)
  return null;
}

