// src/app/api/admin/cavu/sync-health/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { logRequestAttribution } from '@/lib/jobSecret';
import { getCavuHealthForDisplay } from '@/lib/health/cavuWrite';

export async function GET(req: NextRequest) {
  try {
    logRequestAttribution(req, '/api/admin/cavu/sync-health');
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const result = await getCavuHealthForDisplay(ctx.tenantId);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[CAVU SYNC HEALTH] error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

