import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/dynamic-pricing/settings
 * Fetch dynamic pricing settings for the current tenant
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

    const { data: settings, error } = await adminSupabase
      .from('tenant_dynamic_pricing_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching dynamic pricing settings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If no settings exist, return default
    if (!settings) {
      return NextResponse.json({
        id: null,
        tenant_id: tenantId,
        is_enabled: false,
        created_at: null,
        updated_at: null,
      });
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Error in GET /api/admin/dynamic-pricing/settings:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/dynamic-pricing/settings
 * Update dynamic pricing settings for the current tenant
 */
export async function PUT(req: NextRequest) {
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

    const body = await req.json();
    const { is_enabled } = body;

    if (typeof is_enabled !== 'boolean') {
      return NextResponse.json({ error: 'is_enabled must be a boolean' }, { status: 400 });
    }

    // Upsert settings
    const { data: settings, error } = await adminSupabase
      .from('tenant_dynamic_pricing_settings')
      .upsert(
        {
          tenant_id: tenantId,
          is_enabled,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'tenant_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (error) {
      console.error('Error upserting dynamic pricing settings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('Error in PUT /api/admin/dynamic-pricing/settings:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

