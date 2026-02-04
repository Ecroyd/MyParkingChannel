import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { logRequestAttribution } from '@/lib/jobSecret';
import { getCanaryHealth } from '@/lib/health/canary';
import { getCavuSyncHealth } from '@/lib/health/cavu';
import { getEmailParseHealth } from '@/lib/health/emailParse';

export const dynamic = 'force-dynamic';

export interface HealthSnapshotResponse {
  ok: true;
  canary: Awaited<ReturnType<typeof getCanaryHealth>>;
  emailParse: Awaited<ReturnType<typeof getEmailParseHealth>>;
  cavu: Awaited<ReturnType<typeof getCavuSyncHealth>>;
}

/**
 * Single admin health endpoint: canary + email parse + cavu sync.
 * One invocation instead of 3–4. Use with useVisibilityRefetch (mount + tab visible + Refresh button).
 */
export async function GET(req: NextRequest) {
  try {
    logRequestAttribution(req, '/api/admin/health-snapshot');
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [canary, emailParse, cavu] = await Promise.all([
      getCanaryHealth(),
      getEmailParseHealth(ctx.tenantId),
      getCavuSyncHealth(ctx.tenantId),
    ]);

    return NextResponse.json({
      ok: true,
      canary,
      emailParse,
      cavu,
    } satisfies HealthSnapshotResponse);
  } catch (err: any) {
    console.error('[HEALTH SNAPSHOT] error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
