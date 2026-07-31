import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type AdminBookingListQueryParams,
  type AdminBookingListResponse,
  escapePostgrestFilterValue,
} from '@/lib/bookings/adminBookingListParams';
import {
  ADMIN_BOOKING_LIST_SELECT,
  assertAdminBookingListSelectSafe,
  type BookingAdminListRow,
} from '@/lib/bookings/adminBookingListSelect';
import { withQueryTelemetryContext } from '@/lib/supabase/queryTelemetry';
import { tenantDateRangeUtcBounds } from '@/lib/timezone';

export type AdminBookingListQueryLabel =
  | 'admin.bookings.list.ssr'
  | 'admin.bookings.list.api';

function applyListFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  params: AdminBookingListQueryParams
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let q = query.eq('tenant_id', params.tenantId);

  // Reference / plate / name search must find bookings outside the operational
  // date window (e.g. a stay next year). Date bounds still apply when browsing.
  if ((params.dateFrom || params.dateTo) && !params.search) {
    const fromKey = params.dateFrom ?? '1970-01-01';
    const toKey = params.dateTo ?? '2999-12-31';
    const { rangeStart, rangeEnd } = tenantDateRangeUtcBounds(fromKey, toKey);
    // Overlap: booking starts before window end AND ends after window start
    q = q.lte('start_at', rangeEnd).gte('end_at', rangeStart);
  }

  if (params.status) {
    q = q.eq('status', params.status);
  } else if (!params.includeCancelled) {
    q = q.neq('status', 'cancelled');
  }

  if (!params.includeFinished) {
    q = q.gte('end_at', new Date().toISOString());
  }

  if (params.source) {
    const src = escapePostgrestFilterValue(params.source);
    q = q.or(`source.eq.${src},external_source.ilike.${src}`);
  }

  if (params.search) {
    const term = escapePostgrestFilterValue(params.search);
    const pattern = `%${term}%`;
    q = q.or(
      [
        `reference.ilike.${pattern}`,
        `customer_name.ilike.${pattern}`,
        `customer_email.ilike.${pattern}`,
        `customer_phone.ilike.${pattern}`,
        `plate.ilike.${pattern}`,
      ].join(',')
    );
  }

  return q;
}

/**
 * Fetch one paginated admin booking list page.
 * Uses a bounded filtered count (head) — does not download rows to count.
 */
export async function fetchAdminBookingListPage(
  supabase: SupabaseClient,
  params: AdminBookingListQueryParams,
  label: AdminBookingListQueryLabel
): Promise<AdminBookingListResponse> {
  assertAdminBookingListSelectSafe(ADMIN_BOOKING_LIST_SELECT);

  return withQueryTelemetryContext(
    { route: label, queryName: label },
    async () => {
      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;

      const countResult = await withQueryTelemetryContext(
        { route: label, queryName: 'admin.bookings.list.count' },
        async () => {
          let countQuery = supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true });
          countQuery = applyListFilters(countQuery, params);
          return countQuery;
        }
      );

      if (countResult.error) {
        throw new Error(countResult.error.message);
      }

      const totalCount = countResult.count ?? 0;
      const totalPages = Math.max(1, Math.ceil(totalCount / params.pageSize));

      let listQuery = supabase.from('bookings').select(ADMIN_BOOKING_LIST_SELECT);
      listQuery = applyListFilters(listQuery, params);
      listQuery = listQuery
        .order(params.sortField, { ascending: params.sortDirection === 'asc' })
        .order('id', { ascending: true })
        .range(from, to);

      const { data, error } = await listQuery;
      if (error) {
        throw new Error(error.message);
      }

      const rows = (data ?? []) as unknown as BookingAdminListRow[];

      return {
        rows,
        page: params.page,
        pageSize: params.pageSize,
        totalCount,
        totalPages,
        refreshedAt: new Date().toISOString(),
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        usedDefaultDateWindow: params.usedDefaultDateWindow,
      };
    }
  );
}
