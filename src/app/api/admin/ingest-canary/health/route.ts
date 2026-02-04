import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { logRequestAttribution } from '@/lib/jobSecret';
import { getCanaryHealth } from '@/lib/health/canary';

export const dynamic = 'force-dynamic';

/**
 * Health for ingest canary. Same data as health-snapshot canary slice.
 * Auth: tenant admin/owner session.
 */
export async function GET(req: NextRequest) {
  try {
    logRequestAttribution(req, '/api/admin/ingest-canary/health');
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = await getCanaryHealth();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[INGEST CANARY HEALTH] error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
