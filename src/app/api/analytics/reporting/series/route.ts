import { NextRequest, NextResponse } from 'next/server';
import { getReportingAggregate } from '@/lib/analytics/reportingEngine';
import { guardReportingRequest } from '@/lib/analytics/reportingApi';
import { GROUP_BY, type GroupBy } from '@/lib/analytics/reportingTypes';

export async function GET(req: NextRequest) {
  try {
    const guard = await guardReportingRequest(req);
    if (!guard.ok) return guard.response;

    const groupBy = (new URL(req.url).searchParams.get('groupBy') || 'day') as GroupBy;
    if (!GROUP_BY.includes(groupBy)) {
      return NextResponse.json({ error: 'Invalid groupBy' }, { status: 400 });
    }

    const rows = await getReportingAggregate(guard.filters, groupBy);
    return NextResponse.json({ groupBy, rows });
  } catch (error) {
    console.error('[analytics/reporting/series]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
