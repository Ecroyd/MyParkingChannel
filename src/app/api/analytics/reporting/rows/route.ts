import { NextRequest, NextResponse } from 'next/server';
import { loadFilteredReportingRows } from '@/lib/analytics/reportingEngine';
import { guardReportingRequest } from '@/lib/analytics/reportingApi';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET(req: NextRequest) {
  try {
    const guard = await guardReportingRequest(req);
    if (!guard.ok) return guard.response;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);
    const offset = Math.max(Number(searchParams.get('offset') || 0), 0);

    const admin = createAdminClient();
    const rows = await loadFilteredReportingRows(admin, guard.filters, guard.timezone, {
      limit,
      offset,
      includePii: false,
    });

    return NextResponse.json({ rows, limit, offset });
  } catch (error) {
    console.error('[analytics/reporting/rows]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
