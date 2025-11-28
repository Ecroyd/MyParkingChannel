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
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch gate devices for this tenant
    const { data: devices, error: devicesError } = await adminClient
      .from('gate_devices')
      .select('id, name, kind, status, last_seen')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (devicesError) {
      console.error('Error fetching gate devices:', devicesError);
      return NextResponse.json(
        { error: 'Failed to fetch gate devices' },
        { status: 500 }
      );
    }

    return NextResponse.json({ devices: devices || [] });
  } catch (error: any) {
    console.error('Gate devices API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

