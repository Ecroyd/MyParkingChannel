import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/dynamic-pricing/rules
 * Fetch all active dynamic pricing rules for the current tenant
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const { data: rules, error } = await adminSupabase
      .from('tenant_dynamic_pricing_rules')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('threshold_percent', { ascending: true });

    if (error) {
      console.error('Error fetching dynamic pricing rules:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(rules || []);
  } catch (error: any) {
    console.error('Error in GET /api/admin/dynamic-pricing/rules:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/dynamic-pricing/rules
 * Create a new dynamic pricing rule
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Get or create settings to get the settings_id
    const { data: settings, error: settingsError } = await adminSupabase
      .from('tenant_dynamic_pricing_settings')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      return NextResponse.json(
        { error: 'Failed to fetch dynamic pricing settings', details: settingsError.message },
        { status: 500 }
      );
    }

    // If settings don't exist, create them
    let settingsId = settings?.id;
    if (!settingsId) {
      const { data: newSettings, error: createSettingsError } = await adminSupabase
        .from('tenant_dynamic_pricing_settings')
        .insert({
          tenant_id: tenantId,
          is_enabled: false,
        })
        .select('id')
        .single();

      if (createSettingsError) {
        console.error('Error creating settings:', createSettingsError);
        return NextResponse.json(
          { error: 'Failed to create dynamic pricing settings', details: createSettingsError.message },
          { status: 500 }
        );
      }
      settingsId = newSettings.id;
    }

    const body = await req.json();
    const { threshold_percent, price_increase_percent, is_active = true, sort_order = 100 } = body;

    if (typeof threshold_percent !== 'number' || threshold_percent < 0 || threshold_percent > 100) {
      return NextResponse.json(
        { error: 'threshold_percent must be a number between 0 and 100' },
        { status: 400 }
      );
    }

    if (typeof price_increase_percent !== 'number' || price_increase_percent < 0) {
      return NextResponse.json(
        { error: 'price_increase_percent must be a non-negative number' },
        { status: 400 }
      );
    }

    console.log('[POST /api/admin/dynamic-pricing/rules] Inserting rule:', {
      tenant_id: tenantId,
      threshold_percent,
      price_increase_percent,
      is_active,
      sort_order,
      types: {
        threshold_percent: typeof threshold_percent,
        price_increase_percent: typeof price_increase_percent,
      },
    });

    // Convert to proper types for DECIMAL columns
    const insertData = {
      tenant_id: tenantId,
      settings_id: settingsId, // Add settings_id reference
      threshold_percent: parseFloat(threshold_percent.toString()),
      price_increase_percent: parseFloat(price_increase_percent.toString()),
      is_active: Boolean(is_active),
      sort_order: Number(sort_order) || 100,
    };

    console.log('[POST /api/admin/dynamic-pricing/rules] Insert data:', insertData);

    const { data: rule, error } = await adminSupabase
      .from('tenant_dynamic_pricing_rules')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[POST /api/admin/dynamic-pricing/rules] Error creating rule:', {
        error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        insertData,
      });
      
      // Check if table doesn't exist
      if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
        return NextResponse.json(
          { 
            error: 'Dynamic pricing tables not found. Please run the database migration first.',
            details: 'The tenant_dynamic_pricing_rules table does not exist. Run the migration: supabase/migrations/create_dynamic_pricing.sql',
            code: error.code,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { 
          error: error.message || 'Failed to create dynamic pricing rule',
          details: error.details,
          hint: error.hint,
          code: error.code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(rule, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /api/admin/dynamic-pricing/rules:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

