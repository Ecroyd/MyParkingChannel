import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import {
  computeOccupancyTimeseries,
  getCurrentOccupancy,
  OCCUPANCY_INTERVAL_MINUTES,
} from '@/lib/analytics/occupancyTimeseries';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const adminClient = createAdminClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const tenantParam = searchParams.get('tenant_id');

    if (!fromDate || !toDate) {
      return NextResponse.json({ error: 'Missing from or to parameters' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return NextResponse.json({ error: 'from/to must be YYYY-MM-DD' }, { status: 400 });
    }
    if (fromDate > toDate) {
      return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 });
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
    if (!userTenants.some((ut) => ut.tenant_id === tenantId)) {
      return NextResponse.json({ error: 'No access to tenant' }, { status: 403 });
    }

    const { data: tenant } = await adminClient
      .from('tenants')
      .select('id, timezone')
      .eq('id', tenantId)
      .maybeSingle();

    const timezone = tenant?.timezone || DEFAULT_TENANT_TIMEZONE;

    // Actual = vehicles parked according to app booking state (same rules as
    // Currently Parked). The DB baseline/ledger RPC is intentionally not used
    // for Actual here, so the line does not depend on a manual baseline.
    const result = await computeOccupancyTimeseries({
      tenantId,
      fromDate,
      toDate,
      timezone,
      intervalMinutes: OCCUPANCY_INTERVAL_MINUTES,
    });

    const current = await getCurrentOccupancy(tenantId);

    return NextResponse.json({
      intervalMinutes: OCCUPANCY_INTERVAL_MINUTES,
      timezone: result.timezone,
      from: result.from,
      to: result.to,
      points: result.points,
      dataQuality: {
        ...result.dataQuality,
        ...current.dataQuality,
        negativeOccupancyDetected:
          result.dataQuality.negativeOccupancyDetected || current.negativeOccupancyDetected,
      },
      reliableFrom: result.reliableFrom,
      baselineAt: result.baselineAt,
      actualUnavailableBeforeBaseline: result.actualUnavailableBeforeBaseline,
      currentOccupancy: current,
      tenantId,
    });
  } catch (error) {
    console.error('[admin/occupancy-timeseries] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
