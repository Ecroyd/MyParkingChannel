import { getCavuSyncHealth } from '@/lib/health/cavu';
import { createAdminClient } from '@/lib/supabase/server';
import { writeHealthStatus } from '@/lib/health/writeHealthStatus';

export type CavuSyncStatus = 'running' | 'success' | 'failed' | 'idle';

/** Extra fields merged into system_health_status payload key=cavu */
export type CavuHealthPayload = {
  ok: true;
  syncStatus: CavuSyncStatus;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  latestRun: Awaited<ReturnType<typeof getCavuSyncHealth>>['latestRun'];
  latestSuccessfulRun: Awaited<ReturnType<typeof getCavuSyncHealth>>['latestSuccessfulRun'];
  lastSyncedAt: string | null;
};

/**
 * Write CAVU sync snapshot to system_health_status (visible in admin banner).
 * Merges live supplier_sync_runs data with explicit status from the current run.
 */
export async function writeCavuHealthForTenant(
  tenantId: string,
  update: {
    status: CavuSyncStatus;
    last_error?: string | null;
    /** When status=success, sets lastSuccessAt to this (defaults to now). */
    last_success_at?: string | null;
  }
): Promise<void> {
  const base = await getCavuSyncHealth(tenantId);
  const now = new Date().toISOString();

  const previousPayload = base as CavuHealthPayload & Record<string, unknown>;
  const prevSuccess =
    previousPayload.lastSuccessAt ??
    base.latestSuccessfulRun?.started_at ??
    null;

  let lastSuccessAt = prevSuccess;
  if (update.status === 'success') {
    lastSuccessAt = update.last_success_at ?? now;
  }

  const lastRunAt =
    update.status === 'running'
      ? now
      : base.latestRun?.started_at ?? previousPayload.lastRunAt ?? now;

  const payload: CavuHealthPayload = {
    ok: true,
    syncStatus: update.status,
    lastRunAt,
    lastSuccessAt,
    lastError:
      update.status === 'failed'
        ? (update.last_error ?? 'Sync failed')
        : update.status === 'success'
          ? null
          : previousPayload.lastError ?? null,
    latestRun: base.latestRun,
    latestSuccessfulRun: base.latestSuccessfulRun,
    lastSyncedAt: base.lastSyncedAt,
  };

  await writeHealthStatus(tenantId, 'cavu', payload as unknown as Record<string, unknown>);
}

/**
 * Banner/API: merge stored sync status (running/failed/lastError) with live supplier_sync_runs.
 */
export async function getCavuHealthForDisplay(
  tenantId: string
): Promise<CavuHealthPayload> {
  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from('system_health_status')
    .select('payload')
    .eq('tenant_id', tenantId)
    .eq('key', 'cavu')
    .maybeSingle();

  const live = await getCavuSyncHealth(tenantId);
  const stored = (row?.payload ?? {}) as Partial<CavuHealthPayload>;

  return {
    ok: true,
    syncStatus: stored.syncStatus ?? 'idle',
    lastRunAt: stored.lastRunAt ?? live.latestRun?.started_at ?? null,
    lastSuccessAt:
      stored.lastSuccessAt ?? live.latestSuccessfulRun?.started_at ?? null,
    lastError: stored.lastError ?? null,
    latestRun: live.latestRun ?? stored.latestRun ?? null,
    latestSuccessfulRun:
      live.latestSuccessfulRun ?? stored.latestSuccessfulRun ?? null,
    lastSyncedAt: live.lastSyncedAt ?? stored.lastSyncedAt ?? null,
  };
}
