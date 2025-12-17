// GET /api/admin/anpr/config - Get ANPR config for tenant
// PUT /api/admin/anpr/config - Update ANPR config for tenant

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify user has access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch ANPR config (or return defaults if not set)
    const { data: config, error: configError } = await adminClient
      .from('tenant_anpr_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (configError && configError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching ANPR config:', configError);
      return NextResponse.json(
        { error: 'Failed to fetch ANPR config' },
        { status: 500 }
      );
    }

    // Return config or defaults
    const defaultConfig = {
      tenant_id: tenantId,
      enabled: false,
      dedupe_seconds: 60,
      offline_after_minutes: 15,
      camera_direction_map: {},
      arrival_grace_minutes: 240,
      departure_grace_minutes: 480,
    };

    return NextResponse.json({ config: config || defaultConfig });
  } catch (error: any) {
    console.error('ANPR config GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Verify user has admin access to this tenant
    const { data: userTenant } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
      return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
    }

    // Parse request body
    const body = await req.json();
    const {
      enabled,
      dedupe_seconds,
      offline_after_minutes,
      camera_direction_map,
      arrival_grace_minutes,
      departure_grace_minutes,
    } = body;

    // Validate inputs
    if (dedupe_seconds !== undefined && (dedupe_seconds < 0 || dedupe_seconds > 3600)) {
      return NextResponse.json(
        { error: 'dedupe_seconds must be between 0 and 3600' },
        { status: 400 }
      );
    }

    if (offline_after_minutes !== undefined && (offline_after_minutes < 1 || offline_after_minutes > 1440)) {
      return NextResponse.json(
        { error: 'offline_after_minutes must be between 1 and 1440' },
        { status: 400 }
      );
    }

    if (arrival_grace_minutes !== undefined && (arrival_grace_minutes < 0 || arrival_grace_minutes > 1440)) {
      return NextResponse.json(
        { error: 'arrival_grace_minutes must be between 0 and 1440' },
        { status: 400 }
      );
    }

    if (departure_grace_minutes !== undefined && (departure_grace_minutes < 0 || departure_grace_minutes > 1440)) {
      return NextResponse.json(
        { error: 'departure_grace_minutes must be between 0 and 1440' },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (enabled !== undefined) updateData.enabled = enabled;
    if (dedupe_seconds !== undefined) updateData.dedupe_seconds = dedupe_seconds;
    if (offline_after_minutes !== undefined) updateData.offline_after_minutes = offline_after_minutes;
    if (camera_direction_map !== undefined) updateData.camera_direction_map = camera_direction_map;
    if (arrival_grace_minutes !== undefined) updateData.arrival_grace_minutes = arrival_grace_minutes;
    if (departure_grace_minutes !== undefined) updateData.departure_grace_minutes = departure_grace_minutes;

    // Upsert config
    const { data: config, error: configError } = await adminClient
      .from('tenant_anpr_config')
      .upsert({
        tenant_id: tenantId,
        ...updateData,
      }, {
        onConflict: 'tenant_id',
      })
      .select()
      .single();

    if (configError) {
      console.error('Error upserting ANPR config:', configError);
      return NextResponse.json(
        { error: 'Failed to update ANPR config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ config });
  } catch (error: any) {
    console.error('ANPR config PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
