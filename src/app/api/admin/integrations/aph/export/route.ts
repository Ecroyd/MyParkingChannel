// API route to manually trigger APH rate export for current tenant

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';
import { runAphExportForChannel } from '@/lib/integrations/aph/job';

export const runtime = 'nodejs'; // Ensure Node.js runtime for SFTP

/**
 * POST /api/admin/integrations/aph/export
 * Manually trigger an APH rate export for the current tenant
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

    // Get channel configuration
    const { data: channel, error: channelError } = await adminSupabase
      .from('tenant_integration_channels')
      .select('id, enabled')
      .eq('tenant_id', tenantId)
      .eq('provider', 'aph_sftp')
      .maybeSingle();

    if (channelError) {
      console.error('Error fetching APH channel:', channelError);
      return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
    }

    if (!channel) {
      return NextResponse.json({ error: 'APH SFTP channel not configured' }, { status: 404 });
    }

    if (!channel.enabled) {
      return NextResponse.json({ error: 'APH SFTP channel is not enabled' }, { status: 400 });
    }

    // Run the export using the job function
    try {
      await runAphExportForChannel(channel.id);

      // Get the latest export to return details
      const { data: latestExport } = await adminSupabase
        .from('aph_rate_exports')
        .select('filename, rows_count, status, error_message')
        .eq('channel_id', channel.id)
        .order('ran_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestExport?.status === 'success') {
        return NextResponse.json({
          success: true,
          filename: latestExport.filename,
          rows_count: latestExport.rows_count,
          message: `Successfully exported ${latestExport.rows_count} rows to ${latestExport.filename}`,
        });
      } else {
        return NextResponse.json(
          {
            success: false,
            error: latestExport?.error_message || 'Export failed',
          },
          { status: 500 }
        );
      }
    } catch (error: any) {
      console.error('Export error:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Export failed',
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('APH export POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

