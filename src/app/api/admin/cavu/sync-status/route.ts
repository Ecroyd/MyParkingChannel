// src/app/api/admin/cavu/sync-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { getCavuSyncHealth } from '@/lib/health/cavu';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = await getCavuSyncHealth(ctx.tenantId);
    return NextResponse.json({
      ok: true,
      lastRun: result.latestRun,
      latestSuccessfulRun: result.latestSuccessfulRun,
      lastSyncedAt: result.lastSyncedAt,
    });
  } catch (err: any) {
    console.error('[CAVU SYNC STATUS] error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

