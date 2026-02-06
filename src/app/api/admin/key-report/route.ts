import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { OPS_STATUS } from '@/lib/opsStatuses';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = await createAdminClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userTenants, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (userTenantsError || !userTenants?.length) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    const defaultTenant = userTenants.find(ut => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab'); // 'take_key' | 'arrived_key_taken'
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const opsStatusFilter = tab === 'arrived_key_taken'
      ? OPS_STATUS.ARRIVED_KEY_TAKEN
      : OPS_STATUS.TAKE_KEY;

    let query = adminClient
      .from('bookings')
      .select('id, tenant_id, reference, customer_name, customer_email, plate, start_at, end_at, status, ops_status, highlight_code, created_at')
      .eq('tenant_id', tenantId)
      .eq('ops_status', opsStatusFilter)
      .order('start_at', { ascending: false });

    // Date range: booking overlaps [from, to] when start_at <= to AND end_at >= from
    if (from) {
      query = query.gte('end_at', new Date(from + 'T00:00:00.000Z').toISOString());
    }
    if (to) {
      query = query.lte('start_at', new Date(to + 'T23:59:59.999Z').toISOString());
    }

    const { data: bookings, error: queryError } = await query;

    if (queryError) {
      console.error('Key report API error', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    return NextResponse.json({ bookings: bookings || [] });
  } catch (err: any) {
    console.error('Key report API error', err);
    return NextResponse.json({ error: err?.message ?? 'Internal error' }, { status: 500 });
  }
}
