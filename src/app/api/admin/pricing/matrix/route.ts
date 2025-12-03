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
    
    // Channel: treat empty string as 'all', otherwise use the provided channel code
    const channel = channelParam && channelParam !== '' ? channelParam : 'all';

    // Base query builder
    const buildBaseQuery = () => {
      let query = adminSupabase
        .from('pricing_rules')
        .select(`
          id,
          channel,
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

      return query;
    };

    // Helper: Index rules by day (min_stay == max_stay)
    const indexRulesByDay = (rules: any[]): Map<number, { price: number | null; rule: any }> => {
      const map = new Map<number, { price: number | null; rule: any }>();
      for (const r of rules || []) {
        if (r.min_stay != null && r.max_stay === r.min_stay) {
          const tier = Array.isArray(r.price_tiers) ? r.price_tiers[0] : r.price_tiers;
          const value = tier?.value ? parseFloat(tier.value.toString()) : null;
          map.set(r.min_stay, { price: value, rule: r });
        }
      }
      return map;
    };

    // Helper: Get extra day price from rules
    const getExtraDayPrice = (rules: any[]): number | null => {
      const extra = rules.find((r: any) => r.max_stay == null && r.min_stay != null);
      if (!extra) return null;
      const tier = Array.isArray(extra.price_tiers) ? extra.price_tiers[0] : extra.price_tiers;
      return tier?.value ? parseFloat(tier.value.toString()) : null;
    };

    // Helper: Build LOS rows from rules
    const buildLosRowsFromRules = (rules: any[]): Array<{ day: number; price: number | null }> => {
      const map = indexRulesByDay(rules);
      if (map.size === 0) return [];
      const maxDays = Math.max(...Array.from(map.keys()));
      const rows: Array<{ day: number; price: number | null }> = [];
      for (let day = 1; day <= maxDays; day++) {
        const item = map.get(day);
        rows.push({ day, price: item?.price ?? null });
      }
      return rows;
    };

    if (!channel || channel === 'all') {
      // All channels tab: show just the baseline
      const { data: rules, error: rulesError } = await buildBaseQuery().eq('channel', 'all');

      if (rulesError) {
        console.error('Error querying pricing rules:', rulesError);
        return NextResponse.json({ error: rulesError.message }, { status: 500 });
      }

      const rows = buildLosRowsFromRules(rules || []);
      const extraDayPrice = getExtraDayPrice(rules || []);

      return NextResponse.json({
        channel: 'all',
        rows: rows.map(r => ({
          day: r.day,
          price: r.price,
          basePrice: null, // not needed for All
        })),
        extraDayPrice,
        baseExtraPrice: null,
      });
    } else {
      // Specific channel: overlay channel rules on top of 'all'
      const { data: rules, error: rulesError } = await buildBaseQuery().in('channel', ['all', channel]);

      if (rulesError) {
        console.error('Error querying pricing rules:', rulesError);
        return NextResponse.json({ error: rulesError.message }, { status: 500 });
      }

      const baseRules = (rules || []).filter((r: any) => r.channel === 'all');
      const overrideRules = (rules || []).filter((r: any) => r.channel === channel);

      const baseMap = indexRulesByDay(baseRules);
      const overrideMap = indexRulesByDay(overrideRules);

      const allDays = new Set<number>();
      for (const d of baseMap.keys()) allDays.add(d);
      for (const d of overrideMap.keys()) allDays.add(d);

      const maxDays = allDays.size > 0
        ? Math.max(...Array.from(allDays))
        : 30; // default if no rules

      const rows: Array<{ day: number; price: number | null; basePrice: number | null }> = [];

      for (let day = 1; day <= maxDays; day++) {
        const base = baseMap.get(day);
        const override = overrideMap.get(day);

        const basePrice = base?.price ?? null;
        const price = override?.price ?? basePrice;

        rows.push({ day, price, basePrice });
      }

      const baseExtraPrice = getExtraDayPrice(baseRules);
      const overrideExtraPrice = getExtraDayPrice(overrideRules);
      const extraDayPrice = overrideExtraPrice ?? baseExtraPrice;

      return NextResponse.json({
        channel,
        rows,
        extraDayPrice,
        baseExtraPrice,
      });
    }
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
      baseExtraPrice,
    } = body;

    if (!seasonId) {
      return NextResponse.json({ error: 'seasonId is required' }, { status: 400 });
    }

    // Normalize rate_plan_id: "default" or empty string means null
    const ratePlanId = ratePlanIdRaw && ratePlanIdRaw !== 'default' && ratePlanIdRaw !== '' 
      ? ratePlanIdRaw 
      : null;
    
    // Channel: treat null/empty as 'all', otherwise use the provided channel code
    const channelCode = channelRaw && channelRaw !== '' ? channelRaw : 'all';

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

    if (channelCode === 'all') {
      // "All channels" tab: just upsert rows with channel = 'all'
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
        const day = row.day ?? row.days; // Support both 'day' and 'days' for compatibility
        if (day === undefined || row.price === null) continue;

        const price = row.price;
        const tierCode = `los_${seasonCode}_${ratePlanCode}_all_${day}`;
        const tierLabel = `LOS ${day} days – ${season.name} – all`;

        tiersToUpsert.push({
          tenant_id: tenantId,
          code: tierCode,
          label: tierLabel,
          type: 'multiplier',
          value: price,
          is_active: true,
          sort_order: day,
        });
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
          const day = row.day ?? row.days; // Support both 'day' and 'days' for compatibility
          if (day === undefined || row.price === null) continue;

          const tierCode = `los_${seasonCode}_${ratePlanCode}_all_${day}`;
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
            channel: 'all',
            min_stay: day,
            max_stay: day,
            priority: 100,
            is_active: true,
          });
        }

        // Batch upsert all rules at once
        // Since there's no unique constraint, we'll delete existing rules first, then insert
        if (rulesToUpsert.length > 0) {
          // Delete existing rules for this combination to avoid duplicates
          const daysToDelete = rulesToUpsert.map(r => r.min_stay);
          const { error: deleteError } = await adminSupabase
            .from('pricing_rules')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('season_id', seasonId)
            .is('rate_plan_id', ratePlanId || null)
            .eq('channel', 'all')
            .in('min_stay', daysToDelete)
            .not('min_stay', 'is', null);

          if (deleteError) {
            console.error('Error deleting existing rules:', deleteError);
            // Continue anyway - might be no existing rules
          }

          // Insert new rules
          const { error: rulesError } = await adminSupabase
            .from('pricing_rules')
            .insert(rulesToUpsert);

          if (rulesError) {
            console.error('Error inserting pricing rules:', rulesError);
            return NextResponse.json({ error: 'Failed to save pricing rules' }, { status: 500 });
          }
        }
      }

      // Handle extra day price for 'all'
      if (extraDayPrice !== null && extraDayPrice !== undefined) {
        const extraTierCode = `los_extra_${seasonCode}_${ratePlanCode}_all_after_${maxDays || 30}`;
        const extraTierLabel = `Extra day after ${maxDays || 30} days – ${season.name} – all`;

        // Upsert tier
        const { data: upsertedExtraTier, error: extraTierError } = await adminSupabase
          .from('price_tiers')
          .upsert({
            tenant_id: tenantId,
            code: extraTierCode,
            label: extraTierLabel,
            type: 'multiplier',
            value: extraDayPrice,
            is_active: true,
            sort_order: 9999,
          }, {
            onConflict: 'tenant_id,code',
            ignoreDuplicates: false,
          })
          .select('id, code')
          .single();

        if (extraTierError) {
          console.error('Error upserting extra tier:', extraTierError);
        } else if (upsertedExtraTier) {
          // Upsert rule
          await adminSupabase
            .from('pricing_rules')
            .upsert({
              tenant_id: tenantId,
              rate_plan_id: ratePlanId || null,
              season_id: seasonId,
              tier_id: upsertedExtraTier.id,
              channel: 'all',
              min_stay: (maxDays || 30) + 1,
              max_stay: null,
              priority: 100,
              is_active: true,
            }, {
              onConflict: 'tenant_id,season_id,rate_plan_id,channel,min_stay,max_stay',
              ignoreDuplicates: false,
            });
        }
      } else {
        // Delete existing extra day rule if extraDayPrice is null
        await adminSupabase
          .from('pricing_rules')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('season_id', seasonId)
          .is('rate_plan_id', ratePlanId || null)
          .eq('channel', 'all')
          .gt('min_stay', maxDays || 30)
          .is('max_stay', null);
      }
    } else {
      // Specific channel tab: diff-based upsert/delete
      console.log('[PUT /api/admin/pricing/matrix] Processing specific channel:', {
        channelCode,
        seasonId,
        ratePlanId,
        rowsCount: rows?.length || 0,
      });

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

      const rulesToDelete: Array<{ day: number }> = [];
      const tiersToUpsert: Array<{
        tenant_id: string;
        code: string;
        label: string;
        type: string;
        value: number;
        is_active: boolean;
        sort_order: number;
      }> = [];

      // First pass: collect tiers to upsert and determine which rules to delete/upsert
      for (const row of rows || []) {
        const day = row.day ?? row.days; // Support both 'day' and 'days' for compatibility
        const newPrice = row.price;
        const basePrice = row.basePrice;

        if (day === undefined) continue;

        if (newPrice === null && basePrice === null) {
          // Nothing set at all; delete override if exists
          rulesToDelete.push({ day });
        } else if (newPrice === basePrice) {
          // Same as baseline → no need for an override; delete any existing override
          rulesToDelete.push({ day });
        } else if (newPrice !== null && newPrice !== basePrice) {
          // Override differs from baseline → need to upsert override row
          const tierCode = `los_${seasonCode}_${ratePlanCode}_${channelCode}_${day}`;
          const tierLabel = `LOS ${day} days – ${season.name} – ${channelCode}`;

          tiersToUpsert.push({
            tenant_id: tenantId,
            code: tierCode,
            label: tierLabel,
            type: 'multiplier',
            value: newPrice,
            is_active: true,
            sort_order: day,
          });
        }
      }

      console.log('[PUT /api/admin/pricing/matrix] Collected:', {
        tiersToUpsert: tiersToUpsert.length,
        rulesToDelete: rulesToDelete.length,
      });

      // Batch upsert all tiers at once
      const tierMap = new Map<string, string>();
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

        // Second pass: build rules using tier IDs from the map
        for (const row of rows || []) {
          const day = row.day ?? row.days;
          const newPrice = row.price;
          const basePrice = row.basePrice;

          if (day === undefined) continue;

          if (newPrice !== null && newPrice !== basePrice) {
            const tierCode = `los_${seasonCode}_${ratePlanCode}_${channelCode}_${day}`;
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
              channel: channelCode,
              min_stay: day,
              max_stay: day,
              priority: 100,
              is_active: true,
            });
          }
        }
      }

      // Delete override rules that match base or are null
      if (rulesToDelete.length > 0) {
        for (const { day } of rulesToDelete) {
          await adminSupabase
            .from('pricing_rules')
            .delete()
            .eq('tenant_id', tenantId)
            .eq('season_id', seasonId)
            .is('rate_plan_id', ratePlanId || null)
            .eq('channel', channelCode)
            .eq('min_stay', day)
            .eq('max_stay', day);
        }
      }

      // Upsert override rules
      // Since there's no unique constraint on the combination, we'll delete existing rules first, then insert
      if (rulesToUpsert.length > 0) {
        // Delete existing rules for this combination to avoid duplicates
        // Delete all rules for this season/ratePlan/channel where min_stay = max_stay (LOS rules)
        const daysToDelete = rulesToUpsert.map(r => r.min_stay);
        const { error: deleteError } = await adminSupabase
          .from('pricing_rules')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('season_id', seasonId)
          .is('rate_plan_id', ratePlanId || null)
          .eq('channel', channelCode)
          .in('min_stay', daysToDelete)
          .not('min_stay', 'is', null);

        if (deleteError) {
          console.error('[PUT /api/admin/pricing/matrix] Error deleting existing rules:', deleteError);
          // Continue anyway - might be no existing rules
        }

        // Insert new rules
        const { error: rulesError } = await adminSupabase
          .from('pricing_rules')
          .insert(rulesToUpsert);

        if (rulesError) {
          console.error('[PUT /api/admin/pricing/matrix] Error inserting pricing rules:', rulesError);
          console.error('[PUT /api/admin/pricing/matrix] Rules insert details:', {
            rulesCount: rulesToUpsert.length,
            firstRule: rulesToUpsert[0],
            error: rulesError,
          });
          return NextResponse.json(
            {
              error: 'Failed to save pricing rules',
              details: rulesError.message || String(rulesError),
            },
            { status: 500 }
          );
        }
      }

      // Handle extra day price for specific channel
      if (extraDayPrice === baseExtraPrice) {
        // Same as baseline → delete override if exists
        await adminSupabase
          .from('pricing_rules')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('season_id', seasonId)
          .is('rate_plan_id', ratePlanId || null)
          .eq('channel', channelCode)
          .gt('min_stay', maxDays || 30)
          .is('max_stay', null);
      } else if (extraDayPrice !== null && extraDayPrice !== undefined) {
        // Override differs → upsert override
        const extraTierCode = `los_extra_${seasonCode}_${ratePlanCode}_${channelCode}_after_${maxDays || 30}`;
        const extraTierLabel = `Extra day after ${maxDays || 30} days – ${season.name} – ${channelCode}`;

        const { data: upsertedExtraTier, error: extraTierError } = await adminSupabase
          .from('price_tiers')
          .upsert({
            tenant_id: tenantId,
            code: extraTierCode,
            label: extraTierLabel,
            type: 'multiplier',
            value: extraDayPrice,
            is_active: true,
            sort_order: 9999,
          }, {
            onConflict: 'tenant_id,code',
            ignoreDuplicates: false,
          })
          .select('id, code')
          .single();

        if (extraTierError) {
          console.error('Error upserting extra tier:', extraTierError);
        } else if (upsertedExtraTier) {
          await adminSupabase
            .from('pricing_rules')
            .upsert({
              tenant_id: tenantId,
              rate_plan_id: ratePlanId || null,
              season_id: seasonId,
              tier_id: upsertedExtraTier.id,
              channel: channelCode,
              min_stay: (maxDays || 30) + 1,
              max_stay: null,
              priority: 100,
              is_active: true,
            }, {
              onConflict: 'tenant_id,season_id,rate_plan_id,channel,min_stay,max_stay',
              ignoreDuplicates: false,
            });
        }
      }
    }

    // Return updated matrix
    const params = new URLSearchParams({
      season_id: seasonId,
      rate_plan_id: ratePlanId || '',
      channel: channelCode,
    });

    const getReq = new NextRequest(`${req.nextUrl.origin}/api/admin/pricing/matrix?${params}`);
    return GET(getReq);

  } catch (error) {
    console.error('Error in PUT /api/admin/pricing/matrix:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', { errorMessage, errorStack });
    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}

