import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import {
  computeDemandMetricsForWindow,
  enumerateDateKeys,
} from '@/lib/analytics/demandOccupancy';
import { calculateCapacityByDate } from '@/lib/capacity/rolling';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = await createAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const tenantParam = searchParams.get('tenant_id');
    const debugRequested = searchParams.get('debug') === '1';

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from or to parameters' }, { status: 400 });
    }

    const { data: userTenants, error: userTenantsError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default')
      .eq('user_id', user.id);

    if (userTenantsError || !userTenants?.length) {
      return NextResponse.json({ error: 'No tenant access found' }, { status: 403 });
    }

    const defaultTenant = userTenants.find((ut) => ut.is_default) || userTenants[0];
    const tenantId = tenantParam ?? defaultTenant.tenant_id;

    const hasTenantAccess = userTenants.some((ut) => ut.tenant_id === tenantId);
    if (!hasTenantAccess) {
      return NextResponse.json({ error: 'No access to tenant' }, { status: 403 });
    }

    const userRole = userTenants.find((ut) => ut.tenant_id === tenantId)?.role;
    const includeDebug =
      debugRequested && (userRole === 'admin' || userRole === 'owner');

    const { data: tenant } = await adminClient
      .from('tenants')
      .select('id, timezone')
      .eq('id', tenantId)
      .maybeSingle();

    const timezone = tenant?.timezone || DEFAULT_TENANT_TIMEZONE;
    const dayKeys = enumerateDateKeys(from, to);
    const capacity = await calculateCapacityByDate(tenantId, dayKeys);

    const days = await computeDemandMetricsForWindow({
      tenantId,
      from,
      to,
      timezone,
      capacityByDate: capacity,
      includeDebug,
    });

    return NextResponse.json({
      tenantId,
      timezone,
      from,
      to,
      days,
      debug: includeDebug,
    });
  } catch (error) {
    console.error('[analytics/demand-curve] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
