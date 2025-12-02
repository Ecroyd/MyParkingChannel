import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase, createAdminClient } from '@/lib/supabase/server';
import { seedDefaultChannels } from '@/lib/channels/seed';

// POST - Seed default channels for the current tenant
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

    // Seed default channels (idempotent - won't create duplicates)
    await seedDefaultChannels(adminSupabase, tenantId);

    return NextResponse.json({ success: true, message: 'Default channels created' });
  } catch (error: any) {
    console.error('Channels seed error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

