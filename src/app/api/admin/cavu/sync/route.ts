// src/app/api/admin/cavu/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';
import { syncCavuEventsForTenant } from '@/lib/suppliers/cavuEventsSync';
import { writeCavuHealthForTenant } from '@/lib/health/cavuWrite';

async function updateLastSyncedAt(tenantId: string, supabase: ReturnType<typeof createAdminClient>) {
  const { data: existing, error: fetchError } = await supabase
    .from('tenant_supplier_configs')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('supplier_code', 'cavu')
    .single();

  if (fetchError || !existing) {
    console.error('[CAVU ADMIN EVENTS SYNC] Failed to fetch config for last_synced_at update', tenantId, fetchError);
    return;
  }

  const config = (existing.config as any) ?? {};
  const { error: updateError } = await supabase
    .from('tenant_supplier_configs')
    .update({
      config: {
        ...config,
        last_synced_at: new Date().toISOString(),
      },
    })
    .eq('tenant_id', tenantId)
    .eq('supplier_code', 'cavu');

  if (updateError) {
    console.error('[CAVU ADMIN EVENTS SYNC] Failed to update last_synced_at', tenantId, updateError);
  }
}

export async function POST(req: NextRequest) {
  let run: { id: string; started_at?: string } | null = null;
  let tenantIdForFailure: string | null = null;
  const supabase = createAdminClient();

  try {
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { tenantId?: string; hours?: number };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const tenantId = body?.tenantId || ctx.tenantId;
    tenantIdForFailure = tenantId;
    const hours =
      typeof body?.hours === 'number' && body.hours > 0 ? body.hours : 12;

    if (!tenantId) {
      return NextResponse.json(
        { ok: false, error: 'Missing tenantId' },
        { status: 400 }
      );
    }

    if (tenantId !== ctx.tenantId) {
      return NextResponse.json(
        { ok: false, error: 'Cannot sync other tenants' },
        { status: 403 }
      );
    }

    await writeCavuHealthForTenant(tenantId, { status: 'running', last_error: null });

    const { data: insertedRun, error: runInsertError } = await supabase
      .from('supplier_sync_runs')
      .insert({
        tenant_id: tenantId,
        supplier_code: 'cavu',
        started_at: new Date().toISOString(),
        hours,
        meta: {
          trigger_source: 'admin',
          endpoint: '/api/admin/cavu/sync',
        },
      })
      .select('id, started_at')
      .single();

    if (runInsertError) {
      console.error('[CAVU ADMIN EVENTS SYNC] Failed to create sync run record', tenantId, runInsertError);
    } else {
      run = insertedRun;
    }

    const result = await syncCavuEventsForTenant(tenantId, { hours });

    const failed = (result.errors?.length ?? 0) > 0;

    if (!failed) {
      await updateLastSyncedAt(tenantId, supabase);
    }

    if (run) {
      await supabase
        .from('supplier_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          ok: !failed,
          events_seen: result.eventsSeen,
          bookings_upserted: result.bookingsUpserted,
          bookings_cancelled: result.bookingsCancelled,
          errors: result.errors,
        })
        .eq('id', run.id);
    }

    await writeCavuHealthForTenant(tenantId, {
      status: failed ? 'failed' : 'success',
      last_error: failed ? result.errors[0] : null,
    });

    return NextResponse.json({
      ok: true,
      runId: run?.id ?? null,
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[CAVU ADMIN EVENTS SYNC] error', err);
    if (run) {
      await supabase
        .from('supplier_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          ok: false,
          events_seen: 0,
          bookings_upserted: 0,
          bookings_cancelled: 0,
          errors: [message],
        })
        .eq('id', run.id);
    }
    try {
      const ctx = await getCurrentTenantContext();
      const tenantId = tenantIdForFailure ?? ctx?.tenantId;
      if (tenantId) {
        await writeCavuHealthForTenant(tenantId, {
          status: 'failed',
          last_error: message,
        });
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
