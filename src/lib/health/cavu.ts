import { createAdminClient } from '@/lib/supabase/server';

export interface CavuSyncHealthResult {
  ok: true;
  latestRun: {
    id: string;
    started_at: string;
    finished_at: string | null;
    ok: boolean;
    events_seen: number;
    bookings_upserted: number;
    bookings_cancelled: number;
    errors: string[];
    hours: number;
  } | null;
  latestSuccessfulRun: {
    id: string;
    started_at: string;
    finished_at: string | null;
  } | null;
  lastSyncedAt: string | null;
}

export async function getCavuSyncHealth(tenantId: string): Promise<CavuSyncHealthResult> {
  const supabase = createAdminClient();

  const { data: config } = await supabase
    .from('tenant_supplier_configs')
    .select('id, config')
    .eq('tenant_id', tenantId)
    .eq('supplier_code', 'cavu')
    .maybeSingle();

  if (!config) {
    return {
      ok: true,
      latestRun: null,
      latestSuccessfulRun: null,
      lastSyncedAt: null,
    };
  }

  const { data: latestRun } = await supabase
    .from('supplier_sync_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('supplier_code', 'cavu')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: latestSuccessfulRun } = await supabase
    .from('supplier_sync_runs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('supplier_code', 'cavu')
    .eq('ok', true)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const configData = (config.config as { last_synced_at?: string } | null) ?? {};
  const lastSyncedAt = configData.last_synced_at ?? null;

  return {
    ok: true,
    latestRun: latestRun
      ? {
          id: latestRun.id,
          started_at: latestRun.started_at,
          finished_at: latestRun.finished_at,
          ok: latestRun.ok,
          events_seen: latestRun.events_seen ?? 0,
          bookings_upserted: latestRun.bookings_upserted ?? 0,
          bookings_cancelled: latestRun.bookings_cancelled ?? 0,
          errors: latestRun.errors ?? [],
          hours: latestRun.hours ?? 0,
        }
      : null,
    latestSuccessfulRun: latestSuccessfulRun
      ? {
          id: latestSuccessfulRun.id,
          started_at: latestSuccessfulRun.started_at,
          finished_at: latestSuccessfulRun.finished_at,
        }
      : null,
    lastSyncedAt,
  };
}
