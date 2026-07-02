import { createAdminClient } from '@/lib/supabase/server-admin';
import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { loadTodayPageData } from '@/lib/today/loadTodayData';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'Date range parameters required' }, { status: 400 });
    }

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

    const defaultTenant = userTenants.find((ut) => ut.is_default) || userTenants[0];
    const tenantId = defaultTenant.tenant_id;

    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('id, name, slug, timezone, default_capacity')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenantTimezone = tenant.timezone || 'Europe/London';

    const data = await loadTodayPageData({
      adminClient,
      tenantId,
      fromDate,
      toDate,
      tenantTimezone,
      checkedInNow: fromDate === toDate,
      tenant,
    });

    return NextResponse.json({
      tenant: data.tenant,
      kpis: data.kpis,
      arrivals: data.arrivals,
      departures: data.departures,
      currentlyParked: data.currentlyParked,
      rangeFrom: data.rangeFrom,
      rangeTo: data.rangeTo,
      queryError: data.queryError,
    });
  } catch (error) {
    console.error('Today API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
