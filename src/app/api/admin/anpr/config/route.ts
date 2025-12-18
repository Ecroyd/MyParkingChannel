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
      videofit_mode: 'relay' as 'relay' | 'direct',
    };

    // Merge defaults with existing config to ensure new fields are present
    const mergedConfig = config ? { ...defaultConfig, ...config } : defaultConfig;

    // Fetch Videofit secrets from tenant_secrets using encrypted key-value pattern
    const { data: videofitSecrets } = await adminClient
      .from('tenant_secrets')
      .select('key, value_ciphertext')
      .eq('tenant_id', tenantId)
      .eq('scope', 'anpr')
      .in('key', [
        'videofit_base_url',
        'videofit_site_client_license',
        'videofit_loc_pc_no',
        'videofit_default_group',
      ]);

    // Decrypt helper
    const decryptSecret = (encryptedValue: string): string => {
      return Buffer.from(encryptedValue, 'base64').toString();
    };

    const getSecret = (key: string): string | null => {
      const secret = videofitSecrets?.find((s) => s.key === key);
      if (!secret?.value_ciphertext) return null;
      try {
        return decryptSecret(secret.value_ciphertext);
      } catch {
        return null;
      }
    };

    // Get videofit_mode from secrets (default to 'relay')
    const videofitMode = getSecret('videofit_mode') || 'relay';
    const mode = (videofitMode === 'direct' ? 'direct' : 'relay') as 'relay' | 'direct';

    // Add Videofit config to response
    const responseConfig = {
      ...mergedConfig,
      videofit_mode: mode,
      videofit_base_url: getSecret('videofit_base_url') || null,
      videofit_site_client_license: getSecret('videofit_site_client_license')
        ? parseInt(getSecret('videofit_site_client_license')!, 10)
        : null,
      videofit_loc_pc_no: getSecret('videofit_loc_pc_no')
        ? parseInt(getSecret('videofit_loc_pc_no')!, 10)
        : 0,
      videofit_default_group: getSecret('videofit_default_group')
        ? parseInt(getSecret('videofit_default_group')!, 10)
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
      videofit_mode,
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

    if (videofit_mode !== undefined && videofit_mode !== null) {
      if (videofit_mode !== 'relay' && videofit_mode !== 'direct') {
        return NextResponse.json(
          { error: 'videofit_mode must be either "relay" or "direct"' },
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

    // Save Videofit secrets to tenant_secrets using encrypted key-value pattern
    // (like APH SFTP credentials and ANPR relay token)
    const videofitSecrets: Array<{ tenant_id: string; scope: string; key: string; value: string; updated_at: string }> = [];
    const now = new Date().toISOString();

    if (videofit_mode !== undefined) {
      videofitSecrets.push({
        tenant_id: tenantId,
        scope: 'anpr',
        key: 'videofit_mode',
        value: videofit_mode || 'relay',
        updated_at: now,
      });
    }

    if (videofit_base_url !== undefined) {
      videofitSecrets.push({
        tenant_id: tenantId,
        scope: 'anpr',
        key: 'videofit_base_url',
        value: videofit_base_url || '',
        updated_at: now,
      });
    }
    if (videofit_site_client_license !== undefined) {
      videofitSecrets.push({
        tenant_id: tenantId,
        scope: 'anpr',
        key: 'videofit_site_client_license',
        value: String(videofit_site_client_license || ''),
        updated_at: now,
      });
    }
    if (videofit_loc_pc_no !== undefined) {
      videofitSecrets.push({
        tenant_id: tenantId,
        scope: 'anpr',
        key: 'videofit_loc_pc_no',
        value: String(videofit_loc_pc_no ?? 0),
        updated_at: now,
      });
    }
    if (videofit_default_group !== undefined) {
      videofitSecrets.push({
        tenant_id: tenantId,
        scope: 'anpr',
        key: 'videofit_default_group',
        value: String(videofit_default_group ?? 4),
        updated_at: now,
      });
    }

    // Upsert Videofit secrets using encrypted key-value pattern
    for (const secret of videofitSecrets) {
      if (secret.value) {
        // Encrypt the value (using base64 like other secrets)
        const encrypted = Buffer.from(secret.value).toString('base64');
        const { error: secretError } = await adminClient
          .from('tenant_secrets')
          .upsert(
            {
              tenant_id: secret.tenant_id,
              scope: secret.scope,
              key: secret.key,
              value_ciphertext: encrypted,
              updated_at: secret.updated_at,
            },
            { onConflict: 'tenant_id,scope,key' }
          );

        if (secretError) {
          console.error(`Error saving Videofit secret ${secret.key}:`, secretError);
          // Don't fail the whole request, just log it
        }
      } else {
        // Delete if empty
        await adminClient
          .from('tenant_secrets')
          .delete()
          .eq('tenant_id', secret.tenant_id)
          .eq('scope', secret.scope)
          .eq('key', secret.key);
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

    // Re-fetch Videofit secrets to include in response (same as GET route)
    const { data: fetchedVideofitSecrets } = await adminClient
      .from('tenant_secrets')
      .select('key, value_ciphertext')
      .eq('tenant_id', tenantId)
      .eq('scope', 'anpr')
      .in('key', [
        'videofit_mode',
        'videofit_base_url',
        'videofit_site_client_license',
        'videofit_loc_pc_no',
        'videofit_default_group',
      ]);

    // Decrypt helper
    const decryptSecret = (encryptedValue: string): string => {
      return Buffer.from(encryptedValue, 'base64').toString();
    };

    const getSecret = (key: string): string | null => {
      const secret = fetchedVideofitSecrets?.find((s) => s.key === key);
      if (!secret?.value_ciphertext) return null;
      try {
        return decryptSecret(secret.value_ciphertext);
      } catch {
        return null;
      }
    };

    // Get videofit_mode from secrets (default to 'relay')
    const videofitMode = getSecret('videofit_mode') || 'relay';
    const mode = (videofitMode === 'direct' ? 'direct' : 'relay') as 'relay' | 'direct';

    // Merge Videofit config into response
    const responseConfig = {
      ...config,
      videofit_mode: mode,
      videofit_base_url: getSecret('videofit_base_url') || null,
      videofit_site_client_license: getSecret('videofit_site_client_license')
        ? parseInt(getSecret('videofit_site_client_license')!, 10)
        : null,
      videofit_loc_pc_no: getSecret('videofit_loc_pc_no')
        ? parseInt(getSecret('videofit_loc_pc_no')!, 10)
        : 0,
      videofit_default_group: getSecret('videofit_default_group')
        ? parseInt(getSecret('videofit_default_group')!, 10)
        : 4,
    };

    return NextResponse.json({ config: responseConfig });
  } catch (error: any) {
    console.error('ANPR config PUT error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
