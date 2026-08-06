import { NextRequest, NextResponse } from 'next/server';
import { getReportingKpis } from '@/lib/analytics/reportingEngine';
import { computeDemandMetricsForWindow } from '@/lib/analytics/demandOccupancy';
import { guardReportingRequest } from '@/lib/analytics/reportingApi';

export async function GET(req: NextRequest) {
  try {
    const guard = await guardReportingRequest(req);
    if (!guard.ok) return guard.response;

    const compare = new URL(req.url).searchParams.get('compare') === '1';

    let occupancy: { avg: number | null; peak: number | null } | undefined;
    try {
      const series = await computeDemandMetricsForWindow({
        tenantId: guard.tenantId,
        from: guard.filters.from,
        to: guard.filters.to,
        timezone: guard.timezone,
      });
      const occ = series
        .map((p) => p.occupancyPercent)
        .filter((n): n is number => n != null);
      if (occ.length) {
        occupancy = {
          avg: Math.round((occ.reduce((a, b) => a + b, 0) / occ.length) * 10) / 10,
          peak: Math.max(...occ),
        };
      }
    } catch {
      // optional
    }

    const result = await getReportingKpis(guard.filters, {
      comparePrevious: compare,
      occupancy,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[analytics/reporting/kpis]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
