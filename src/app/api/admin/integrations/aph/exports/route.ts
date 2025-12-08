// API route to get APH rate export history for current tenant

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/integrations/aph/exports
 * Get export history for current tenant
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

    // Get channel ID
    const { data: channel } = await adminSupabase
      .from('tenant_integration_channels')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('provider', 'aph_sftp')
      .maybeSingle();

    if (!channel) {
      return NextResponse.json({ exports: [] });
    }

    // Get export history
    const { data: exports, error: exportsError } = await adminSupabase
      .from('aph_rate_exports')
      .select('id, filename, rows_count, status, error_message, ran_at')
      .eq('channel_id', channel.id)
      .order('ran_at', { ascending: false })
      .limit(50); // Last 50 exports

    if (exportsError) {
      console.error('Error fetching exports:', exportsError);
      return NextResponse.json({ error: 'Failed to fetch exports' }, { status: 500 });
    }

    return NextResponse.json({ exports: exports || [] });
  } catch (error: any) {
    console.error('APH exports GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

