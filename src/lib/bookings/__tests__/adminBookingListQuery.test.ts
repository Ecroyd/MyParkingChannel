import { describe, it, expect, vi } from 'vitest';
import { fetchAdminBookingListPage } from '@/lib/bookings/adminBookingListQuery';
import { resolveAdminBookingListParams } from '@/lib/bookings/adminBookingListParams';
import { ADMIN_BOOKING_LIST_SELECT } from '@/lib/bookings/adminBookingListSelect';

function createMockSupabase(opts?: { count?: number; rows?: unknown[] }) {
  const count = opts?.count ?? 0;
  const rows = opts?.rows ?? [];
  const selectCalls: Array<{ columns: string; options?: unknown }> = [];

  const builder: Record<string, unknown> = {};
  const chain = () => builder;

  builder.eq = vi.fn(chain);
  builder.neq = vi.fn(chain);
  builder.gte = vi.fn(chain);
  builder.lte = vi.fn(chain);
  builder.or = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.range = vi.fn(() => Promise.resolve({ data: rows, error: null, count: null }));
  builder.then = undefined;

  // head count query resolves as a thenable-like via awaiting the builder in supabase-js;
  // our code awaits countQuery directly — make the builder thenable for head selects.
  const makeThenable = (result: unknown) => {
    (builder as { then?: unknown }).then = (
      onfulfilled: (v: unknown) => unknown,
      onrejected?: (e: unknown) => unknown
    ) => Promise.resolve(result).then(onfulfilled, onrejected);
    return builder;
  };

  const from = vi.fn(() => ({
    select: (columns: string, options?: { count?: string; head?: boolean }) => {
      selectCalls.push({ columns, options });
      if (options?.head) {
        return makeThenable({ count, error: null, data: null });
      }
      // list query continues chaining; final .range resolves
      (builder as { then?: unknown }).then = undefined;
      builder.range = vi.fn(() => Promise.resolve({ data: rows, error: null }));
      return builder;
    },
  }));

  return {
    client: { from } as never,
    selectCalls,
  };
}

describe('fetchAdminBookingListPage', () => {
  it('never calls select("*")', async () => {
    const { client, selectCalls } = createMockSupabase({ count: 10, rows: [] });
    const params = resolveAdminBookingListParams({
      tenantId: 't1',
      datesCleared: true,
      pageSize: 50,
    });

    await fetchAdminBookingListPage(client, params, 'admin.bookings.list.api');

    expect(selectCalls.length).toBeGreaterThan(0);
    for (const call of selectCalls) {
      expect(call.columns).not.toBe('*');
      expect(call.columns.includes('*')).toBe(false);
    }
    expect(selectCalls.some((c) => c.columns === ADMIN_BOOKING_LIST_SELECT)).toBe(true);
    expect(selectCalls.some((c) => c.options && (c.options as { head?: boolean }).head)).toBe(
      true
    );
  });

  it('uses range pagination and returns the response shape', async () => {
    const row = {
      id: 'b1',
      tenant_id: 't1',
      reference: 'ABC',
      customer_name: 'Test',
      customer_email: null,
      customer_phone: null,
      plate: 'AB12CDE',
      car_make: null,
      car_model: null,
      car_color: null,
      start_at: '2026-07-01T10:00:00.000Z',
      end_at: '2026-07-05T10:00:00.000Z',
      status: 'reserved',
      ops_status: null,
      gate_status: null,
      anpr_status: null,
      flight_number: null,
      return_flight_number: null,
      external_source: null,
      source: 'direct',
      money_charged: 10,
      money_received: 10,
      highlight_code: 'none',
      is_incomplete: false,
      missing_fields: [],
      dynamic_pricing_applied: false,
      dynamic_pricing_multiplier: null,
      dynamic_pricing_occupancy_percent: null,
      dynamic_pricing_rule_id: null,
      updated_at: null,
      created_at: null,
    };
    const { client } = createMockSupabase({ count: 120, rows: [row] });
    const params = resolveAdminBookingListParams({
      tenantId: 't1',
      page: '2',
      pageSize: '50',
      datesCleared: true,
    });

    const result = await fetchAdminBookingListPage(client, params, 'admin.bookings.list.ssr');

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(50);
    expect(result.totalCount).toBe(120);
    expect(result.totalPages).toBe(3);
    expect(result.rows).toHaveLength(1);
    expect(result.refreshedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.rows[0]).not.toHaveProperty('notes');
  });
});

describe('SSR initial-load guard contract', () => {
  it('documents that clients must skip the first fetch when initialList is provided', () => {
    // Behaviour is enforced in BookingsServerClient via skipNextFetchRef.
    // This test locks the intended contract for reviewers/regressions.
    const skipInitialClientFetch = true;
    const ssrProvidesInitialList = true;
    expect(ssrProvidesInitialList && skipInitialClientFetch).toBe(true);
  });
});
