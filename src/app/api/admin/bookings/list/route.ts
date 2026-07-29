// GET /api/admin/bookings/list — paginated admin booking list (max 100 rows)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createServerClient } from '@/lib/supabase/server';
import { resolveAdminBookingListParams } from '@/lib/bookings/adminBookingListParams';
import { fetchAdminBookingListPage } from '@/lib/bookings/adminBookingListQuery';
import { withQueryTelemetryContext } from '@/lib/supabase/queryTelemetry';

export async function GET(req: NextRequest) {
  return withQueryTelemetryContext(
    { route: '/api/admin/bookings/list', queryName: 'admin.bookings.list.api' },
    async () => {
      try {
        const { searchParams } = new URL(req.url);
        const tenantId = searchParams.get('tenantId');

        if (!tenantId) {
          return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
        }

        const supabase = await createServerClient();
        const adminClient = createAdminClient();

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) {
          return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { data: userTenant } = await adminClient
          .from('user_tenants')
          .select('tenant_id, role')
          .eq('user_id', user.id)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (!userTenant || (userTenant.role !== 'admin' && userTenant.role !== 'owner')) {
          return NextResponse.json(
            { error: 'Access denied. Admin role required.' },
            { status: 403 }
          );
        }

        const { data: tenant } = await adminClient
          .from('tenants')
          .select('timezone')
          .eq('id', tenantId)
          .maybeSingle();

        const params = resolveAdminBookingListParams({
          tenantId,
          page: searchParams.get('page'),
          pageSize: searchParams.get('pageSize'),
          search: searchParams.get('search'),
          dateFrom: searchParams.get('dateFrom'),
          dateTo: searchParams.get('dateTo'),
          status: searchParams.get('status'),
          source: searchParams.get('source'),
          sort: searchParams.get('sort'),
          sortField: searchParams.get('sortField'),
          sortDirection: searchParams.get('sortDirection'),
          includeCancelled: searchParams.get('includeCancelled'),
          includeFinished: searchParams.get('includeFinished'),
          datesCleared: searchParams.get('datesCleared'),
          timezone: tenant?.timezone || 'Europe/London',
        });

        const result = await fetchAdminBookingListPage(
          adminClient,
          params,
          'admin.bookings.list.api'
        );

        return NextResponse.json(result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('[Bookings List] Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }
  );
}
