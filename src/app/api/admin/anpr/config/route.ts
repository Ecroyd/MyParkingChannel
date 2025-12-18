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

    // Return config or defaults, merging defaults for missing fields
    const defaultConfig = {
      tenant_id: tenantId,
      enabled: false,
      dedupe_seconds: 60,
      offline_after_minutes: 15,
      camera_direction_map: {},
      arrival_grace_minutes: 240,
      departure_grace_minutes: 480,
      whitelist_lookahead_days: 7,
      whitelist_keep_after_end_hours: 24,
      videofit_api_url: null,
      videofit_username: null,
      videofit_password: null,
      csv_token_last_rotated_at: null,
    };

    // Merge defaults with existing config to ensure new fields are present
    const mergedConfig = config ? { ...defaultConfig, ...config } : defaultConfig;

    // Fetch Videofit secrets from tenant_secrets (column-based storage)
    const { data: videofitSecrets } = await adminClient
      .from('tenant_secrets')
      .select('videofit_base_url, videofit_site_client_license, videofit_loc_pc_no, videofit_default_group')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    // Add Videofit config to response
    const responseConfig = {
      ...mergedConfig,
      videofit_base_url: videofitSecrets?.videofit_base_url || null,
      videofit_site_client_license: videofitSecrets?.videofit_site_client_license
        ? parseInt(String(videofitSecrets.videofit_site_client_license), 10)
        : null,
      videofit_loc_pc_no: videofitSecrets?.videofit_loc_pc_no
        ? parseInt(String(videofitSecrets.videofit_loc_pc_no), 10)
        : 0,
      videofit_default_group: videofitSecrets?.videofit_default_group
        ? parseInt(String(videofitSecrets.videofit_default_group), 10)
        : 4,
    };

    return NextResponse.json({ config: responseConfig });
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
      whitelist_lookahead_days,
      whitelist_keep_after_end_hours,
      videofit_base_url,
      videofit_site_client_license,
      videofit_loc_pc_no,
      videofit_default_group,
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

    if (whitelist_lookahead_days !== undefined && (whitelist_lookahead_days < 1 || whitelist_lookahead_days > 365)) {
      return NextResponse.json(
        { error: 'whitelist_lookahead_days must be between 1 and 365' },
        { status: 400 }
      );
    }

    if (whitelist_keep_after_end_hours !== undefined && (whitelist_keep_after_end_hours < 0 || whitelist_keep_after_end_hours > 168)) {
      return NextResponse.json(
        { error: 'whitelist_keep_after_end_hours must be between 0 and 168' },
        { status: 400 }
      );
    }

    if (videofit_base_url !== undefined && videofit_base_url && typeof videofit_base_url === 'string') {
      try {
        new URL(videofit_base_url);
      } catch {
        return NextResponse.json(
          { error: 'videofit_base_url must be a valid URL' },
          { status: 400 }
        );
      }
    }

    if (videofit_site_client_license !== undefined && videofit_site_client_license !== null) {
      const license = parseInt(String(videofit_site_client_license), 10);
      if (isNaN(license) || license <= 0) {
        return NextResponse.json(
          { error: 'videofit_site_client_license must be a positive integer' },
          { status: 400 }
        );
      }
    }

    if (videofit_loc_pc_no !== undefined && videofit_loc_pc_no !== null) {
      const locPcNo = parseInt(String(videofit_loc_pc_no), 10);
      if (isNaN(locPcNo) || locPcNo < 0) {
        return NextResponse.json(
          { error: 'videofit_loc_pc_no must be a non-negative integer' },
          { status: 400 }
        );
      }
    }

    if (videofit_default_group !== undefined && videofit_default_group !== null) {
      const group = parseInt(String(videofit_default_group), 10);
      if (isNaN(group) || group <= 0) {
        return NextResponse.json(
          { error: 'videofit_default_group must be a positive integer' },
          { status: 400 }
        );
      }
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
    if (whitelist_lookahead_days !== undefined) updateData.whitelist_lookahead_days = whitelist_lookahead_days;
    if (whitelist_keep_after_end_hours !== undefined) updateData.whitelist_keep_after_end_hours = whitelist_keep_after_end_hours;

    // Save Videofit secrets to tenant_secrets (column-based storage)
    const videofitSecretsData: any = {
      tenant_id: tenantId,
      updated_at: new Date().toISOString(),
    };

    if (videofit_base_url !== undefined) {
      videofitSecretsData.videofit_base_url = videofit_base_url || null;
    }
    if (videofit_site_client_license !== undefined) {
      videofitSecretsData.videofit_site_client_license = videofit_site_client_license
        ? String(videofit_site_client_license)
        : null;
    }
    if (videofit_loc_pc_no !== undefined) {
      videofitSecretsData.videofit_loc_pc_no = videofit_loc_pc_no !== null && videofit_loc_pc_no !== undefined
        ? String(videofit_loc_pc_no)
        : '0';
    }
    if (videofit_default_group !== undefined) {
      videofitSecretsData.videofit_default_group = videofit_default_group !== null && videofit_default_group !== undefined
        ? String(videofit_default_group)
        : '4';
    }

    // Upsert Videofit secrets (only if at least one field is being updated)
    if (Object.keys(videofitSecretsData).length > 2) { // More than just tenant_id and updated_at
      const { error: secretsError } = await adminClient
        .from('tenant_secrets')
        .upsert(videofitSecretsData, { onConflict: 'tenant_id' });

      if (secretsError) {
        console.error('Error saving Videofit secrets:', secretsError);
        // Don't fail the whole request, just log it
      }
    }

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
