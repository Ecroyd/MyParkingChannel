// src/app/admin/bookings-server/page.tsx
export const dynamic = 'force-dynamic';

import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import BookingsServerClient from './BookingsServerClient';
import { resolveAdminBookingListParams } from '@/lib/bookings/adminBookingListParams';
import { fetchAdminBookingListPage } from '@/lib/bookings/adminBookingListQuery';
import { withQueryTelemetryContext } from '@/lib/supabase/queryTelemetry';
import { canViewMoney, normalizeRole } from '@/lib/auth/permissions';
import { redactBookingMoneyList } from '@/lib/money';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function BookingsServerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createServerClient();
  const adminClient = createAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Please log in to continue</p>
        </div>
      </div>
    );
  }

  const { data: userTenants, error: userTenantsError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (userTenantsError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Error loading tenant data</p>
        </div>
      </div>
    );
  }

  const userTenant = userTenants?.find((ut) => ut.is_default) || userTenants?.[0];

  if (!userTenant?.tenant_id) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No tenant access found</p>
        </div>
      </div>
    );
  }

  const { data: tenant, error: tenantError } = await adminClient
    .from('tenants')
    .select('id, name, slug, timezone, default_capacity')
    .eq('id', userTenant.tenant_id)
    .single();

  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Error loading tenant details</p>
        </div>
      </div>
    );
  }

  const params = resolveAdminBookingListParams({
    tenantId: tenant.id,
    page: first(sp.page),
    pageSize: first(sp.pageSize),
    search: first(sp.search),
    dateFrom: first(sp.dateFrom),
    dateTo: first(sp.dateTo),
    status: first(sp.status),
    source: first(sp.source),
    sort: first(sp.sort),
    datesCleared: first(sp.datesCleared),
    timezone: tenant.timezone || 'Europe/London',
  });

  let initialList;
  try {
    initialList = await withQueryTelemetryContext(
      { route: '/admin/bookings-server', queryName: 'admin.bookings.list.ssr' },
      () => fetchAdminBookingListPage(adminClient, params, 'admin.bookings.list.ssr')
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Error loading bookings: {message}</p>
        </div>
      </div>
    );
  }

  const showMoney = canViewMoney(normalizeRole(userTenant.role));

  return (
    <BookingsServerClient
      user={user}
      tenant={tenant}
      initialList={
        showMoney
          ? initialList
          : { ...initialList, rows: redactBookingMoneyList(initialList.rows) }
      }
      initialParams={params}
    />
  );
}
