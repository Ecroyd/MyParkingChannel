'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { saveAphSftpCredentials as saveAphSftpCredentialsLib } from '@/lib/integrations/aph/secrets';
// Don't import runAphExportForChannel directly - use dynamic import to avoid bundling native modules
import type { AphSftpCredentials } from '@/lib/integrations/aph/types';

/**
 * Save APH channel settings
 */
export async function saveAphChannelSettings(params: {
  tenantId: string;
  enabled: boolean;
  supplierCode: string;
  daysAhead: number;
  send_frequency_minutes: number;
}) {
  try {
    // Verify user has access to this tenant
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const adminClient = createAdminClient();
    const { data: userTenants } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', params.tenantId)
      .maybeSingle();

    if (!userTenants || (userTenants.role !== 'admin' && userTenants.role !== 'owner')) {
      return { error: 'Forbidden - admin access required' };
    }

    // Validate inputs
    if (!params.supplierCode || params.supplierCode.trim() === '') {
      return { error: 'Supplier code is required' };
    }

    if (params.daysAhead < 1 || params.daysAhead > 730) {
      return { error: 'Days ahead must be between 1 and 730' };
    }

    if (params.send_frequency_minutes < 1) {
      return { error: 'Send frequency must be at least 1 minute' };
    }

    // Upsert channel
    const config = {
      format: 'B1' as const,
      supplierCode: params.supplierCode,
      daysAhead: params.daysAhead,
      send_frequency_minutes: params.send_frequency_minutes,
    };

    const { data: existingChannel } = await adminClient
      .from('tenant_integration_channels')
      .select('id')
      .eq('tenant_id', params.tenantId)
      .eq('provider', 'aph_sftp')
      .maybeSingle();

    let channelId: string;
    if (existingChannel) {
      // Update existing
      const { data: updated, error: updateError } = await adminClient
        .from('tenant_integration_channels')
        .update({
          enabled: params.enabled,
          config,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingChannel.id)
        .select('id, enabled, config, updated_at')
        .single();

      if (updateError || !updated) {
        return { error: 'Failed to update channel' };
      }

      channelId = updated.id;
    } else {
      // Create new
      const { data: created, error: createError } = await adminClient
        .from('tenant_integration_channels')
        .insert({
          tenant_id: params.tenantId,
          provider: 'aph_sftp',
          enabled: params.enabled,
          config,
        })
        .select('id, enabled, config, updated_at')
        .single();

      if (createError || !created) {
        return { error: 'Failed to create channel' };
      }

      channelId = created.id;
    }

    // Get last export time
    const { data: lastExport } = await adminClient
      .from('aph_rate_exports')
      .select('ran_at')
      .eq('channel_id', channelId)
      .eq('status', 'success')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      success: true,
      channel: {
        id: channelId,
        enabled: params.enabled,
        config,
        last_export_at: lastExport?.ran_at || null,
      },
    };
  } catch (error: any) {
    console.error('[APH] Error saving channel settings:', error);
    return { error: error.message || 'Failed to save settings' };
  }
}

/**
 * Save APH SFTP credentials
 */
export async function saveAphSftpCredentials(params: {
  tenantId: string;
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
}) {
  try {
    // Verify user has access to this tenant
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const adminClient = createAdminClient();
    const { data: userTenants } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', params.tenantId)
      .maybeSingle();

    if (!userTenants || (userTenants.role !== 'admin' && userTenants.role !== 'owner')) {
      return { error: 'Forbidden - admin access required' };
    }

    // Validate inputs
    if (!params.host || !params.username || !params.password) {
      return { error: 'Host, username, and password are required' };
    }

    if (!params.port || params.port < 1 || params.port > 65535) {
      return { error: 'Port must be between 1 and 65535' };
    }

    // Save credentials
    const credentials: AphSftpCredentials = {
      host: params.host,
      port: params.port,
      username: params.username,
      password: params.password,
      remotePath: params.remotePath || '/',
    };

    await saveAphSftpCredentialsLib(params.tenantId, credentials);

    return { success: true };
  } catch (error: any) {
    console.error('[APH] Error saving SFTP credentials:', error);
    return { error: error.message || 'Failed to save credentials' };
  }
}

/**
 * Run APH export now (manual trigger)
 */
export async function runAphExportNow(params: { channelId: string }) {
  try {
    // Verify user has access to this channel's tenant
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Unauthorized' };
    }

    const adminClient = createAdminClient();

    // Get channel to verify tenant access
    const { data: channel } = await adminClient
      .from('tenant_integration_channels')
      .select('tenant_id')
      .eq('id', params.channelId)
      .single();

    if (!channel) {
      return { error: 'Channel not found' };
    }

    const { data: userTenants } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', channel.tenant_id)
      .maybeSingle();

    if (!userTenants || (userTenants.role !== 'admin' && userTenants.role !== 'owner')) {
      return { error: 'Forbidden - admin access required' };
    }

    // Run the export using dynamic import to avoid bundling native SFTP modules
    const { runAphExportForChannel } = await import('@/lib/integrations/aph/job');
    await runAphExportForChannel(params.channelId);

    return { ok: true };
  } catch (error: any) {
    console.error('[APH] Error running export:', error);
    return { ok: false, error: error.message || 'Export failed' };
  }
}

