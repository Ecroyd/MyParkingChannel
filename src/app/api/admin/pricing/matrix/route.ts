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
      const tier = rule.price_tiers;
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
      const tier = rule.price_tiers;
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
    
    // If channel is null (all channels), we'll save to all individual channels
    const channelsToSave = channel ? [channel] : ['direct', 'agent', 'web', 'default'];

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

    // Process each row - save to all channels if "all channels" was selected
    for (const row of rows || []) {
      if (row.days === undefined || row.price === null) continue;

      const days = row.days;
      const price = row.price;

      // Save to each channel
      for (const channelToSave of channelsToSave) {
        const channelCode = channelToSave;
        
        // Generate deterministic tier code
        const tierCode = `los_${seasonCode}_${ratePlanCode}_${channelCode}_${days}`;
        const tierLabel = `LOS ${days} days – ${season.name} – ${channelCode}`;

        // Check if tier exists
        const { data: existingTier } = await adminSupabase
          .from('price_tiers')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('code', tierCode)
          .maybeSingle();

        let tierId: string;
        
        if (existingTier) {
          // Update existing tier
          const { data: updatedTier, error: updateError } = await adminSupabase
            .from('price_tiers')
            .update({
              label: tierLabel,
              value: price,
              is_active: true,
              sort_order: days,
            })
            .eq('id', existingTier.id)
            .select()
            .single();

          if (updateError) {
            console.error('Error updating tier:', updateError);
            continue;
          }
          tierId = updatedTier.id;
        } else {
          // Insert new tier
          const { data: newTier, error: insertError } = await adminSupabase
            .from('price_tiers')
            .insert({
              tenant_id: tenantId,
              code: tierCode,
              label: tierLabel,
              type: 'multiplier',
              value: price,
              is_active: true,
              sort_order: days,
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error inserting tier:', insertError);
            continue;
          }
          tierId = newTier.id;
        }

        // Check if pricing rule exists
        const { data: existingRule } = await adminSupabase
          .from('pricing_rules')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('season_id', seasonId)
          .eq('rate_plan_id', ratePlanId || null)
          .eq('channel', channelToSave)
          .eq('min_stay', days)
          .eq('max_stay', days)
          .maybeSingle();

        if (existingRule) {
          // Update existing rule
          await adminSupabase
            .from('pricing_rules')
            .update({
              tier_id: tierId,
              priority: 100,
              is_active: true,
            })
            .eq('id', existingRule.id);
        } else {
          // Insert new rule
          await adminSupabase
            .from('pricing_rules')
            .insert({
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
    }

    // Handle extra day price - save to all channels if "all channels" was selected
    if (extraDayPrice !== null && extraDayPrice !== undefined) {
      for (const channelToSave of channelsToSave) {
        const channelCode = channelToSave;
        const extraTierCode = `los_extra_${seasonCode}_${ratePlanCode}_${channelCode}_after_${maxDays || 30}`;
        const extraTierLabel = `Extra day after ${maxDays || 30} days – ${season.name} – ${channelCode}`;

        // Check if extra tier exists
        const { data: existingExtraTier } = await adminSupabase
          .from('price_tiers')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('code', extraTierCode)
          .maybeSingle();

        let extraTierId: string;
        
        if (existingExtraTier) {
          // Update existing tier
          const { data: updatedTier, error: updateError } = await adminSupabase
            .from('price_tiers')
            .update({
              label: extraTierLabel,
              value: extraDayPrice,
              is_active: true,
            })
            .eq('id', existingExtraTier.id)
            .select()
            .single();

          if (updateError) {
            console.error('Error updating extra tier:', updateError);
            continue;
          }
          extraTierId = updatedTier.id;
        } else {
          // Insert new tier
          const { data: newTier, error: insertError } = await adminSupabase
            .from('price_tiers')
            .insert({
              tenant_id: tenantId,
              code: extraTierCode,
              label: extraTierLabel,
              type: 'multiplier',
              value: extraDayPrice,
              is_active: true,
              sort_order: 9999,
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error inserting extra tier:', insertError);
            continue;
          }
          extraTierId = newTier.id;
        }

        if (extraTierId) {
          // Check if extra day rule exists
          const { data: existingExtraRule } = await adminSupabase
            .from('pricing_rules')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('season_id', seasonId)
            .eq('rate_plan_id', ratePlanId || null)
            .eq('channel', channelToSave)
            .eq('min_stay', (maxDays || 30) + 1)
            .is('max_stay', null)
            .maybeSingle();

          if (existingExtraRule) {
            // Update existing rule
            await adminSupabase
              .from('pricing_rules')
              .update({
                tier_id: extraTierId,
                priority: 100,
                is_active: true,
              })
              .eq('id', existingExtraRule.id);
          } else {
            // Insert new rule
            await adminSupabase
              .from('pricing_rules')
              .insert({
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
      }
    } else {
      // Delete existing extra day rules for all channels if extraDayPrice is null
      for (const channelToSave of channelsToSave) {
        await adminSupabase
          .from('pricing_rules')
          .delete()
          .eq('tenant_id', tenantId)
          .eq('season_id', seasonId)
          .eq('rate_plan_id', ratePlanId || null)
          .eq('channel', channelToSave)
          .gt('min_stay', maxDays || 30)
          .is('max_stay', null);
      }
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

