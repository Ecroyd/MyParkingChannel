// src/app/api/admin/cavu/sync-health/route.ts
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

    // Check if CAVU is configured
    const { data: config } = await supabase
      .from('tenant_supplier_configs')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('supplier_code', 'cavu')
      .maybeSingle();

    if (!config) {
      // No CAVU config - return empty status
      return NextResponse.json({
        ok: true,
        latestRun: null,
        latestSuccessfulRun: null,
      });
    }

    // Get latest run
    const { data: latestRun } = await supabase
      .from('supplier_sync_runs')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('supplier_code', 'cavu')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get latest successful run
    const { data: latestSuccessfulRun } = await supabase
      .from('supplier_sync_runs')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('supplier_code', 'cavu')
      .eq('ok', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      latestRun: latestRun ? {
        id: latestRun.id,
        started_at: latestRun.started_at,
        finished_at: latestRun.finished_at,
        ok: latestRun.ok,
        events_seen: latestRun.events_seen,
        bookings_upserted: latestRun.bookings_upserted,
        bookings_cancelled: latestRun.bookings_cancelled,
        errors: latestRun.errors,
        hours: latestRun.hours,
      } : null,
      latestSuccessfulRun: latestSuccessfulRun ? {
        id: latestSuccessfulRun.id,
        started_at: latestSuccessfulRun.started_at,
        finished_at: latestSuccessfulRun.finished_at,
      } : null,
    });
  } catch (err: any) {
    console.error('[CAVU SYNC HEALTH] error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

