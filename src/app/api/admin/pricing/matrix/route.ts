import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/pricing/matrix
 * Loads the LOS pricing matrix for a given season + rate plan + channel combination
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's tenant
    const adminSupabase = await createAdminClient();
    const { data: userTenants, error: tenantError } = await adminSupabase
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (tenantError || !userTenants || userTenants.length === 0) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 404 });
    }

    const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
    const tenantId = userTenant.tenant_id;

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const seasonId = searchParams.get('season_id');
    const ratePlanIdParam = searchParams.get('rate_plan_id');
    const channelParam = searchParams.get('channel');

    if (!seasonId) {
      return NextResponse.json({ error: 'season_id is required' }, { status: 400 });
    }

    // Normalize rate_plan_id: "default" or empty string means null (no specific rate plan)
    const ratePlanId = ratePlanIdParam && ratePlanIdParam !== 'default' && ratePlanIdParam !== '' 
      ? ratePlanIdParam 
      : null;
    
    // Normalize channel: empty string means null (all channels)
    const channel = channelParam && channelParam !== '' ? channelParam : null;

    // Query pricing_rules for this combination
    // We need to join with price_tiers to get the actual price values
    let query = adminSupabase
      .from('pricing_rules')
      .select(`
        id,
        min_stay,
        max_stay,
        tier_id,
        price_tiers (
          id,
          code,
          value,
          type
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('season_id', seasonId)
      .eq('is_active', true);

    if (ratePlanId) {
      query = query.eq('rate_plan_id', ratePlanId);
    } else {
      query = query.is('rate_plan_id', null);
    }

    if (channel) {
      query = query.eq('channel', channel);
    } else {
      query = query.is('channel', null);
    }

    const { data: rules, error: rulesError } = await query;

    if (rulesError) {
      console.error('Error querying pricing rules:', rulesError);
      return NextResponse.json({ error: rulesError.message }, { status: 400 });
    }

    // Build the matrix
    const rows: Array<{ days: number; price: number | null }> = [];
    let extraDayPrice: number | null = null;
    let maxDefinedDay = 0;

    // Process rules to build day-to-price mapping
    for (const rule of rules || []) {
      // price_tiers is returned as an array from Supabase join, get first element
      const tier = Array.isArray(rule.price_tiers) 
        ? rule.price_tiers[0] 
        : rule.price_tiers;
      if (!tier || !tier.value) continue;

      const minStay = rule.min_stay;
      const maxStay = rule.max_stay;

      // Check if this is an "extra day" rule (min_stay > maxDefinedDay and max_stay is null)
      if (minStay && maxStay === null) {
        // This might be an extra day rule, but we need to check if there are defined days before it
        // We'll process this after we've seen all the regular rules
        continue;
      }

      // Regular LOS rule: min_stay = max_stay (specific day)
      if (minStay && maxStay === minStay) {
        rows.push({ days: minStay, price: parseFloat(tier.value.toString()) });
        maxDefinedDay = Math.max(maxDefinedDay, minStay);
      }
    }

    // Now check for extra day rules
    for (const rule of rules || []) {
      // price_tiers is returned as an array from Supabase join, get first element
      const tier = Array.isArray(rule.price_tiers) 
        ? rule.price_tiers[0] 
        : rule.price_tiers;
      if (!tier || !tier.value) continue;

      const minStay = rule.min_stay;
      const maxStay = rule.max_stay;

      // Extra day rule: min_stay > maxDefinedDay and max_stay is null
      if (minStay && maxStay === null && minStay > maxDefinedDay) {
        extraDayPrice = parseFloat(tier.value.toString());
        break; // Take the first matching extra day rule
      }
    }

    return NextResponse.json({
      rows,
      extraDayPrice,
      maxDefinedDay,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/pricing/matrix:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/pricing/matrix
 * Saves the LOS pricing matrix for a given season + rate plan + channel combination
 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's tenant
    const adminSupabase = await createAdminClient();
    const { data: userTenants, error: tenantError } = await adminSupabase
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (tenantError || !userTenants || userTenants.length === 0) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 404 });
    }

    const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
    const tenantId = userTenant.tenant_id;

    const body = await req.json();
    const {
      seasonId,
      ratePlanId: ratePlanIdRaw,
      channel: channelRaw,
      maxDays,
      rows,
      extraDayPrice,
    } = body;

    if (!seasonId) {
      return NextResponse.json({ error: 'seasonId is required' }, { status: 400 });
    }

    // Normalize rate_plan_id: "default" or empty string means null
    const ratePlanId = ratePlanIdRaw && ratePlanIdRaw !== 'default' && ratePlanIdRaw !== '' 
      ? ratePlanIdRaw 
      : null;
    
    // Normalize channel: empty string means null (all channels)
    const channel = channelRaw && channelRaw !== '' ? channelRaw : null;
    
    // If channel is null (all channels), fetch all active channels for this tenant
    let channelsToSave: string[];
    if (channel) {
      channelsToSave = [channel];
    } else {
      // Fetch all active channels for this tenant
      const { data: allChannels, error: channelsError } = await adminSupabase
        .from('tenant_channels')
        .select('code')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (channelsError) {
        console.error('Error fetching channels:', channelsError);
        // Fallback to default channels if fetch fails
        channelsToSave = ['direct', 'agent', 'web', 'all'];
      } else {
        // Extract channel codes, excluding 'all' itself (we don't want to save to 'all' channel)
        channelsToSave = (allChannels || [])
          .map((ch: any) => ch.code)
          .filter((code: string) => code !== 'all'); // Don't save to 'all' channel, save to all individual channels
      }
    }

    // Get season info for code generation
    const { data: season, error: seasonError } = await adminSupabase
      .from('seasons')
      .select('code, name')
      .eq('id', seasonId)
      .eq('tenant_id', tenantId)
      .single();

    if (seasonError || !season) {
      return NextResponse.json({ error: 'Season not found' }, { status: 404 });
    }

    const seasonCode = season.code;
    const ratePlanCode = ratePlanId || 'default';

    // Batch upsert all tiers first
    const tiersToUpsert: Array<{
      tenant_id: string;
      code: string;
      label: string;
      type: string;
      value: number;
      is_active: boolean;
      sort_order: number;
    }> = [];

    // Collect all tier data
    for (const row of rows || []) {
      if (row.days === undefined || row.price === null) continue;

      const days = row.days;
      const price = row.price;

      for (const channelToSave of channelsToSave) {
        const tierCode = `los_${seasonCode}_${ratePlanCode}_${channelToSave}_${days}`;
        const tierLabel = `LOS ${days} days – ${season.name} – ${channelToSave}`;

        tiersToUpsert.push({
          tenant_id: tenantId,
          code: tierCode,
          label: tierLabel,
          type: 'multiplier',
          value: price,
          is_active: true,
          sort_order: days,
        });
      }
    }

    // Batch upsert all tiers at once
    if (tiersToUpsert.length > 0) {
      const { data: upsertedTiers, error: tiersError } = await adminSupabase
        .from('price_tiers')
        .upsert(tiersToUpsert, {
          onConflict: 'tenant_id,code',
          ignoreDuplicates: false,
        })
        .select('id, code');

      if (tiersError) {
        console.error('Error upserting tiers:', tiersError);
        return NextResponse.json({ error: 'Failed to save pricing tiers' }, { status: 500 });
      }

      // Create a map of tier code to tier ID for quick lookup
      const tierMap = new Map<string, string>();
      if (upsertedTiers) {
        for (const tier of upsertedTiers) {
          tierMap.set(tier.code, tier.id);
        }
      }

      // If some tiers already existed, fetch their IDs
      if (tierMap.size < tiersToUpsert.length) {
        const codesToFetch = tiersToUpsert
          .map(t => t.code)
          .filter(code => !tierMap.has(code));
        
        if (codesToFetch.length > 0) {
          const { data: existingTiers } = await adminSupabase
            .from('price_tiers')
            .select('id, code')
            .eq('tenant_id', tenantId)
            .in('code', codesToFetch);

          if (existingTiers) {
            for (const tier of existingTiers) {
              tierMap.set(tier.code, tier.id);
            }
          }
        }
      }

      // Batch upsert all pricing rules
      const rulesToUpsert: Array<{
        tenant_id: string;
        rate_plan_id: string | null;
        season_id: string;
        tier_id: string;
        channel: string;
        min_stay: number;
        max_stay: number;
        priority: number;
        is_active: boolean;
      }> = [];

      for (const row of rows || []) {
        if (row.days === undefined || row.price === null) continue;

        const days = row.days;

        for (const channelToSave of channelsToSave) {
          const tierCode = `los_${seasonCode}_${ratePlanCode}_${channelToSave}_${days}`;
          const tierId = tierMap.get(tierCode);

          if (!tierId) {
            console.error(`Tier ID not found for code: ${tierCode}`);
            continue;
          }

          rulesToUpsert.push({
            tenant_id: tenantId,
            rate_plan_id: ratePlanId || null,
            season_id: seasonId,
            tier_id: tierId,
            channel: channelToSave,
            min_stay: days,
            max_stay: days,
            priority: 100,
            is_active: true,
          });
        }
      }

      // Batch upsert all rules at once
      if (rulesToUpsert.length > 0) {
        const { error: rulesError } = await adminSupabase
          .from('pricing_rules')
          .upsert(rulesToUpsert, {
            onConflict: 'tenant_id,season_id,rate_plan_id,channel,min_stay,max_stay',
            ignoreDuplicates: false,
          });

        if (rulesError) {
          console.error('Error upserting pricing rules:', rulesError);
          return NextResponse.json({ error: 'Failed to save pricing rules' }, { status: 500 });
        }
      }
    }

    // Handle extra day price - batch upsert for all channels
    if (extraDayPrice !== null && extraDayPrice !== undefined) {
      const extraTiersToUpsert: Array<{
        tenant_id: string;
        code: string;
        label: string;
        type: string;
        value: number;
        is_active: boolean;
        sort_order: number;
      }> = [];

      for (const channelToSave of channelsToSave) {
        const extraTierCode = `los_extra_${seasonCode}_${ratePlanCode}_${channelToSave}_after_${maxDays || 30}`;
        const extraTierLabel = `Extra day after ${maxDays || 30} days – ${season.name} – ${channelToSave}`;

        extraTiersToUpsert.push({
          tenant_id: tenantId,
          code: extraTierCode,
          label: extraTierLabel,
          type: 'multiplier',
          value: extraDayPrice,
          is_active: true,
          sort_order: 9999,
        });
      }

      // Batch upsert extra tiers
      if (extraTiersToUpsert.length > 0) {
        const { data: upsertedExtraTiers, error: extraTiersError } = await adminSupabase
          .from('price_tiers')
          .upsert(extraTiersToUpsert, {
            onConflict: 'tenant_id,code',
            ignoreDuplicates: false,
          })
          .select('id, code');

        if (extraTiersError) {
          console.error('Error upserting extra tiers:', extraTiersError);
        } else if (upsertedExtraTiers) {
          // Create map of extra tier codes to IDs
          const extraTierMap = new Map<string, string>();
          for (const tier of upsertedExtraTiers) {
            extraTierMap.set(tier.code, tier.id);
          }

          // If some tiers already existed, fetch their IDs
          if (extraTierMap.size < extraTiersToUpsert.length) {
            const codesToFetch = extraTiersToUpsert
              .map(t => t.code)
              .filter(code => !extraTierMap.has(code));
            
            if (codesToFetch.length > 0) {
              const { data: existingExtraTiers } = await adminSupabase
                .from('price_tiers')
                .select('id, code')
                .eq('tenant_id', tenantId)
                .in('code', codesToFetch);

              if (existingExtraTiers) {
                for (const tier of existingExtraTiers) {
                  extraTierMap.set(tier.code, tier.id);
                }
              }
            }
          }

          // Build rules for extra day pricing
          const extraRulesToUpsert: Array<{
            tenant_id: string;
            rate_plan_id: string | null;
            season_id: string;
            tier_id: string;
            channel: string;
            min_stay: number;
            max_stay: null;
            priority: number;
            is_active: boolean;
          }> = [];

          for (const channelToSave of channelsToSave) {
            const extraTierCode = `los_extra_${seasonCode}_${ratePlanCode}_${channelToSave}_after_${maxDays || 30}`;
            const extraTierId = extraTierMap.get(extraTierCode);

            if (extraTierId) {
              extraRulesToUpsert.push({
                tenant_id: tenantId,
                rate_plan_id: ratePlanId || null,
                season_id: seasonId,
                tier_id: extraTierId,
                channel: channelToSave,
                min_stay: (maxDays || 30) + 1,
                max_stay: null,
                priority: 100,
                is_active: true,
              });
            }
          }

          // Batch upsert extra rules
          if (extraRulesToUpsert.length > 0) {
            await adminSupabase
              .from('pricing_rules')
              .upsert(extraRulesToUpsert, {
                onConflict: 'tenant_id,season_id,rate_plan_id,channel,min_stay,max_stay',
                ignoreDuplicates: false,
              });
          }
        }
      }
    } else {
      // Delete existing extra day rules if extraDayPrice is null (batch delete)
      await adminSupabase
        .from('pricing_rules')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('season_id', seasonId)
        .is('rate_plan_id', ratePlanId || null)
        .in('channel', channelsToSave)
        .gt('min_stay', maxDays || 30)
        .is('max_stay', null);
    }

    // Return updated matrix for the selected channel (or first channel if "all" was selected)
    const returnChannel = channel || channelsToSave[0];
    const params = new URLSearchParams({
      season_id: seasonId,
      rate_plan_id: ratePlanId || '',
      channel: returnChannel,
    });

    // Call GET handler to return updated data
    const getReq = new NextRequest(`${req.nextUrl.origin}/api/admin/pricing/matrix?${params}`);
    return GET(getReq);
  } catch (error) {
    console.error('Error in PUT /api/admin/pricing/matrix:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

