import { NextRequest, NextResponse } from 'next/server';
import { getChannelPerformance } from '@/lib/analytics/reportingEngine';
import { guardReportingRequest } from '@/lib/analytics/reportingApi';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function GET(req: NextRequest) {
  try {
    const guard = await guardReportingRequest(req);
    if (!guard.ok) return guard.response;

    const listOnly = new URL(req.url).searchParams.get('list') === '1';
    if (listOnly) {
      const admin = createAdminClient();
      const { data } = await admin
        .from('tenant_channels')
        .select('code, name, is_active, sort_order')
        .eq('tenant_id', guard.tenantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      return NextResponse.json({ channels: data ?? [] });
    }

    const rows = await getChannelPerformance(guard.filters);
    return NextResponse.json({ rows });
  } catch (error) {
    console.error('[analytics/reporting/channels]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
