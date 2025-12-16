// src/app/api/admin/cavu/sync-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get last sync run
    const { data: lastRun } = await supabase
      .from('supplier_sync_runs')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('supplier_code', 'cavu')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get last_synced_at from config
    const { data: config } = await supabase
      .from('tenant_supplier_configs')
      .select('config')
      .eq('tenant_id', ctx.tenantId)
      .eq('supplier_code', 'cavu')
      .maybeSingle();

    const configData = (config?.config as any) ?? {};
    const lastSyncedAt = configData.last_synced_at || null;

    return NextResponse.json({
      ok: true,
      lastRun: lastRun ? {
        id: lastRun.id,
        started_at: lastRun.started_at,
        finished_at: lastRun.finished_at,
        ok: lastRun.ok,
        events_seen: lastRun.events_seen,
        bookings_upserted: lastRun.bookings_upserted,
        bookings_cancelled: lastRun.bookings_cancelled,
        errors: lastRun.errors,
        hours: lastRun.hours,
        meta: lastRun.meta,
      } : null,
      lastSyncedAt,
    });
  } catch (err: any) {
    console.error('[CAVU SYNC STATUS] error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

