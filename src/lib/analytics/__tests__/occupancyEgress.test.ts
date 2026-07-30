/**
 * Egress regression tests for the occupancy endpoints.
 *
 * The occupancy chart was responsible for the majority of PostgREST egress:
 * an unstable parent callback re-created the fetch effect on every render, so the
 * browser refetched in a tight loop, and each request pulled ~1.7 MB of rows of
 * which ~1.4 MB was discarded. These tests lock in both halves of the fix.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';

const { queries } = vi.hoisted(() => ({
  queries: [] as { table: string; limits: number[]; columns: string }[],
}));

vi.mock('@/lib/supabase/admin', () => {
  const makeBuilder = (record: { table: string; limits: number[]; columns: string }) => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    for (const method of ['eq', 'or', 'lt', 'gt', 'gte', 'lte', 'in', 'not', 'order']) {
      builder[method] = chain;
    }
    builder.select = (columns: string) => {
      record.columns = columns;
      return builder;
    };
    builder.limit = (n: number) => {
      record.limits.push(n);
      return builder;
    };
    builder.maybeSingle = async () => ({ data: null, error: null });
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: [], error: null }));
    return builder;
  };

  return {
    createAdminClient: () => ({
      from: (table: string) => {
        const record = { table, limits: [] as number[], columns: '' };
        queries.push(record);
        return makeBuilder(record);
      },
    }),
  };
});

const tablesQueried = () => queries.map((q) => q.table);

describe('getCurrentOccupancy query shape', () => {
  beforeEach(() => {
    queries.length = 0;
  });

  it('reads only the on-site candidates and the reliable-from setting', async () => {
    const { getCurrentOccupancy } = await import('@/lib/analytics/occupancyTimeseries');
    await getCurrentOccupancy('tenant-1');

    expect(tablesQueried().sort()).toEqual(['bookings', 'tenant_settings']);
  });

  it('never loads the movement ledger or snapshots, which the resolver ignores', async () => {
    const { getCurrentOccupancy } = await import('@/lib/analytics/occupancyTimeseries');
    await getCurrentOccupancy('tenant-1');

    expect(tablesQueried()).not.toContain('booking_occupancy_events');
    expect(tablesQueried()).not.toContain('tenant_occupancy_snapshots');
  });

  it('issues exactly one bookings read, not a wide historical window', async () => {
    const { getCurrentOccupancy } = await import('@/lib/analytics/occupancyTimeseries');
    await getCurrentOccupancy('tenant-1');

    expect(tablesQueried().filter((t) => t === 'bookings')).toHaveLength(1);
  });

  it('never selects * from bookings', async () => {
    const { getCurrentOccupancy } = await import('@/lib/analytics/occupancyTimeseries');
    await getCurrentOccupancy('tenant-1');

    const bookings = queries.find((q) => q.table === 'bookings');
    expect(bookings?.columns).toBeTruthy();
    expect(bookings?.columns).not.toContain('*');
  });
});

describe('loadOccupancyInputs query shape', () => {
  beforeEach(() => {
    queries.length = 0;
  });

  it('does not read the movement ledger unless explicitly requested', async () => {
    const { loadOccupancyInputs } = await import('@/lib/analytics/occupancyTimeseries');
    await loadOccupancyInputs({
      tenantId: 'tenant-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-15T00:00:00.000Z',
    });

    expect(tablesQueried()).not.toContain('booking_occupancy_events');
  });

  it('reads the ledger when opted in', async () => {
    const { loadOccupancyInputs } = await import('@/lib/analytics/occupancyTimeseries');
    await loadOccupancyInputs({
      tenantId: 'tenant-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-15T00:00:00.000Z',
      includeEvents: true,
    });

    expect(tablesQueried()).toContain('booking_occupancy_events');
  });

  it('fetches only the latest snapshot by default', async () => {
    const { loadOccupancyInputs } = await import('@/lib/analytics/occupancyTimeseries');
    await loadOccupancyInputs({
      tenantId: 'tenant-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-15T00:00:00.000Z',
    });

    const snapshots = queries.find((q) => q.table === 'tenant_occupancy_snapshots');
    expect(snapshots?.limits).toEqual([1]);
  });

  it('fetches the full snapshot history when opted in', async () => {
    const { loadOccupancyInputs } = await import('@/lib/analytics/occupancyTimeseries');
    await loadOccupancyInputs({
      tenantId: 'tenant-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-15T00:00:00.000Z',
      includeAllSnapshots: true,
    });

    const snapshots = queries.find((q) => q.table === 'tenant_occupancy_snapshots');
    expect(snapshots?.limits).toEqual([]);
  });
});

/**
 * There is no component-test harness in this repo, so the runaway-refetch fix is
 * guarded at source level. react-hooks/exhaustive-deps would actively ask for the
 * dependency that caused the loop, so this invariant cannot be a lint rule.
 */
describe('OccupancyTimelineChart refetch invariants', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/components/charts/OccupancyTimelineChart.tsx'),
    'utf8'
  );

  const fetchSeriesDeps = () => {
    const body = source.slice(source.indexOf('const fetchSeries = useCallback'));
    const deps = body.match(/\}, \[([^\]]*)\]\);/);
    return deps?.[1] ?? '';
  };

  it('does not depend on the parent onCurrentOccupancy callback', () => {
    expect(fetchSeriesDeps()).not.toContain('onCurrentOccupancy');
  });

  it('still depends on the inputs that legitimately change the series', () => {
    const deps = fetchSeriesDeps();
    expect(deps).toContain('from');
    expect(deps).toContain('to');
    expect(deps).toContain('tenantId');
  });

  it('invokes the parent callback through a ref', () => {
    expect(source).toContain('onCurrentOccupancyRef.current');
  });

  it('does not call the raw callback prop inside the fetch path', () => {
    expect(source).not.toMatch(/[^.]onCurrentOccupancy\(/);
  });

  it('skips the background poll while the tab is hidden', () => {
    expect(source).toContain("document.visibilityState === 'hidden'");
  });
});
