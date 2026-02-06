import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { logRequestAttribution } from '@/lib/jobSecret';
import { getCanaryHealth } from '@/lib/health/canary';
import { getCavuSyncHealth } from '@/lib/health/cavu';
import { getEmailParseHealth } from '@/lib/health/emailParse';

export const dynamic = 'force-dynamic';

const CANARY_FALLBACK = {
  status: 'unknown' as const,
  lastOk: null,
  ingestDown: true,
  lastError: null,
  token: null,
  processingDown: true,
  lastProcessedOk: null,
};

const EMAIL_PARSE_FALLBACK = {
  ok: true as const,
  hasIssues: false,
  failedFiles: [],
  pendingFiles: [],
  emptyParsedFiles: [],
  summary: { failedCount: 0, stuckPendingCount: 0, emptyParsedCount: 0 },
};

const CAVU_FALLBACK = {
  ok: true as const,
  latestRun: null,
  latestSuccessfulRun: null,
  lastSyncedAt: null,
};

export interface HealthSnapshotResponse {
  ok: true;
  canary: Awaited<ReturnType<typeof getCanaryHealth>>;
  emailParse: Awaited<ReturnType<typeof getEmailParseHealth>>;
  cavu: Awaited<ReturnType<typeof getCavuSyncHealth>>;
}

/**
 * Single admin health endpoint: canary + email parse + cavu sync.
 * One invocation instead of 3–4. Use with useVisibilityRefetch (mount + tab visible + Refresh button).
 * Each check is run independently; a failing check returns a fallback so the shell still loads.
 */
export async function GET(req: NextRequest) {
  try {
    logRequestAttribution(req, '/api/admin/health-snapshot');
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [canary, emailParse, cavu] = await Promise.all([
      getCanaryHealth().catch((err) => {
        console.error('[HEALTH SNAPSHOT] canary failed', err);
        return CANARY_FALLBACK;
      }),
      getEmailParseHealth(ctx.tenantId).catch((err) => {
        console.error('[HEALTH SNAPSHOT] emailParse failed', err);
        return EMAIL_PARSE_FALLBACK;
      }),
      getCavuSyncHealth(ctx.tenantId).catch((err) => {
        console.error('[HEALTH SNAPSHOT] cavu failed', err);
        return CAVU_FALLBACK;
      }),
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
