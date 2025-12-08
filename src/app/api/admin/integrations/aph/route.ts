// API routes for managing APH SFTP integration configuration

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';
import { getAphSftpCredentials, saveAphSftpCredentials } from '@/lib/integrations/aph/secrets';
import type { AphConfig, AphSftpCredentials } from '@/lib/integrations/aph/types';

/**
 * GET /api/admin/integrations/aph
 * Get APH SFTP configuration for current tenant
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { data: userTenants, error: tenantError } = await adminSupabase
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (tenantError || !userTenants || userTenants.length === 0) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 404 });
    }

    const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
    const tenantId = userTenant.tenant_id;

    // Get channel configuration
    const { data: channel, error: channelError } = await adminSupabase
      .from('tenant_integration_channels')
      .select('id, enabled, config')
      .eq('tenant_id', tenantId)
      .eq('provider', 'aph_sftp')
      .maybeSingle();

    if (channelError && channelError.code !== 'PGRST116') {
      console.error('Error fetching APH channel:', channelError);
      return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
    }

    // Get SFTP credentials (without password for security)
    const credentials = await getAphSftpCredentials(tenantId);
    const credentialsSafe = credentials
      ? {
          host: credentials.host,
          port: credentials.port,
          username: credentials.username,
          remotePath: credentials.remotePath,
          // Don't return password
        }
      : null;

    // Normalize config format for response
    const rawConfig = channel?.config as any;
    const normalizedConfig = rawConfig
      ? {
          format: 'B1' as const,
          supplierCode: rawConfig.supplierCode || rawConfig.supplier_code || '',
          daysAhead: rawConfig.daysAhead || rawConfig.days_ahead || 365,
          send_frequency_minutes: rawConfig.send_frequency_minutes || rawConfig.sendFrequencyMinutes || 60,
          ...(rawConfig.validFromDate || rawConfig.valid_from_date
            ? { validFromDate: rawConfig.validFromDate || rawConfig.valid_from_date }
            : {}),
        }
      : null;

    return NextResponse.json({
      channel: channel
        ? {
            id: channel.id,
            enabled: channel.enabled,
            config: normalizedConfig,
          }
        : null,
      credentials: credentialsSafe,
    });
  } catch (error: any) {
    console.error('APH GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/integrations/aph
 * Create or update APH SFTP configuration
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { data: userTenants, error: tenantError } = await adminSupabase
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (tenantError || !userTenants || userTenants.length === 0) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 404 });
    }

    const userTenant = userTenants.find((ut: any) => ut.is_default) || userTenants[0];
    const tenantId = userTenant.tenant_id;

    // Check if user is admin
    if (userTenant.role !== 'admin' && userTenant.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const {
      enabled,
      config,
      credentials,
    }: {
      enabled?: boolean;
      config?: AphConfig;
      credentials?: Omit<AphSftpCredentials, 'password'> & { password?: string };
    } = body;

    // Validate config (handle both old and new formats)
    if (config) {
      // Support both old format (supplier_code, days_ahead) and new format (supplierCode, daysAhead)
      const format = config.format || 'B1';
      const supplierCode = (config as any).supplierCode || (config as any).supplier_code || '';
      const daysAhead = (config as any).daysAhead || (config as any).days_ahead || 365;
      const sendFrequencyMinutes = (config as any).send_frequency_minutes || (config as any).sendFrequencyMinutes || 60;
      const validFromDate = (config as any).validFromDate || (config as any).valid_from_date;

      if (format !== 'B1') {
        return NextResponse.json({ error: 'Only B1 format is currently supported' }, { status: 400 });
      }
      if (!supplierCode || supplierCode.trim() === '') {
        return NextResponse.json({ error: 'Supplier code is required' }, { status: 400 });
      }
      if (sendFrequencyMinutes < 1) {
        return NextResponse.json({ error: 'Send frequency must be at least 1 minute' }, { status: 400 });
      }
      if (daysAhead < 1 || daysAhead > 730) {
        return NextResponse.json({ error: 'Days ahead must be between 1 and 730' }, { status: 400 });
      }

      // Normalize to new format
      config.format = 'B1' as any;
      (config as any).supplierCode = supplierCode;
      (config as any).daysAhead = daysAhead;
      (config as any).send_frequency_minutes = sendFrequencyMinutes;
      if (validFromDate) {
        (config as any).validFromDate = validFromDate;
      }
    }

    // Upsert channel configuration
    const { data: existingChannel } = await adminSupabase
      .from('tenant_integration_channels')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('provider', 'aph_sftp')
      .maybeSingle();

    if (existingChannel) {
      // Update existing
      const updateData: any = {};
      if (enabled !== undefined) updateData.enabled = enabled;
      if (config) {
        // Store in normalized format
        updateData.config = {
          format: 'B1',
          supplierCode: (config as any).supplierCode,
          daysAhead: (config as any).daysAhead,
          send_frequency_minutes: (config as any).send_frequency_minutes,
          ...((config as any).validFromDate ? { validFromDate: (config as any).validFromDate } : {}),
        };
      }
      updateData.updated_at = new Date().toISOString();

      const { error: updateError } = await adminSupabase
        .from('tenant_integration_channels')
        .update(updateData)
        .eq('id', existingChannel.id);

      if (updateError) {
        console.error('Error updating APH channel:', updateError);
        return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 });
      }
    } else {
      // Create new
      if (!config) {
        return NextResponse.json({ error: 'Config is required for new channel' }, { status: 400 });
      }

      const { error: insertError } = await adminSupabase
        .from('tenant_integration_channels')
        .insert({
          tenant_id: tenantId,
          provider: 'aph_sftp',
          enabled: enabled ?? false,
          config: {
            format: 'B1',
            supplierCode: (config as any).supplierCode,
            daysAhead: (config as any).daysAhead,
            send_frequency_minutes: (config as any).send_frequency_minutes,
            ...((config as any).validFromDate ? { validFromDate: (config as any).validFromDate } : {}),
          },
        });

      if (insertError) {
        console.error('Error creating APH channel:', insertError);
        return NextResponse.json({ error: 'Failed to create configuration' }, { status: 500 });
      }
    }

    // Save SFTP credentials if provided
    if (credentials) {
      if (!credentials.host || !credentials.username) {
        return NextResponse.json({ error: 'Host and username are required' }, { status: 400 });
      }

      // Get existing credentials to preserve password if not provided
      const existingCredentials = await getAphSftpCredentials(tenantId);
      const fullCredentials: AphSftpCredentials = {
        host: credentials.host,
        port: credentials.port || 22,
        username: credentials.username,
        password: credentials.password || existingCredentials?.password || '',
        remotePath: credentials.remotePath || credentials.remote_path || existingCredentials?.remotePath || '/',
      };

      if (!fullCredentials.password) {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
      }

      await saveAphSftpCredentials(tenantId, fullCredentials);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('APH POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

