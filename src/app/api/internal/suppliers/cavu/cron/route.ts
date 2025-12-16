import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { syncCavuEventsForTenant } from '@/lib/suppliers/cavuEventsSync';

/**
 * Calculate hours to sync based on last_synced_at.
 * Returns null if no last_synced_at exists.
 */
function computeHoursFromLastSyncedAt(
  lastSyncedAt: string | null | undefined
): number | null {
  if (!lastSyncedAt) {
    return null;
  }

  // Calculate hours since last sync
  const lastSync = new Date(lastSyncedAt);
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));

  return diffHours;
}

/**
 * Update last_synced_at in tenant_supplier_configs.config for a tenant
 */
async function updateLastSyncedAt(tenantId: string, supabase: ReturnType<typeof createAdminClient>) {
  const { data: existing, error: fetchError } = await supabase
    .from('tenant_supplier_configs')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('supplier_code', 'cavu')
    .single();

  if (fetchError || !existing) {
    console.error('[CAVU CRON] Failed to fetch config for last_synced_at update', tenantId, fetchError);
    return;
  }

  const config = (existing.config as any) ?? {};
  const updatedConfig = {
    ...config,
    last_synced_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from('tenant_supplier_configs')
    .update({ config: updatedConfig })
    .eq('tenant_id', tenantId)
    .eq('supplier_code', 'cavu');

  if (updateError) {
    console.error('[CAVU CRON] Failed to update last_synced_at', tenantId, updateError);
  }
}

async function runCavuCron(req?: NextRequest) {
  const supabase = createAdminClient();

  // Get optional hours param from query string (for testing/backfill)
  const url = req?.nextUrl;
  const hoursParam = Number(url?.searchParams.get('hours'));
  const hasExplicitHours = Number.isFinite(hoursParam) && hoursParam > 0;

  // Get all tenants that have a CAVU config (including config JSON for last_synced_at)
  const { data: configs, error } = await supabase
    .from('tenant_supplier_configs')
    .select('tenant_id, config')
    .eq('supplier_code', 'cavu');

  if (error) {
    console.error('[CAVU CRON] Failed to load configs', error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const logs: any[] = [];
  let totalEvents = 0;
  let totalBookings = 0;

  for (const configRow of configs ?? []) {
    const tenantId = configRow.tenant_id;
    const configData = (configRow.config as any) ?? {};
    const lastSyncedAt = configData.last_synced_at;

    // Calculate hours to sync
    let hoursToFetch: number;

    if (hasExplicitHours) {
      // manual backfill mode: DO NOT CLAMP
      hoursToFetch = Math.floor(hoursParam);
    } else {
      // normal mode: compute from lastSyncedAt then clamp
      const computed = computeHoursFromLastSyncedAt(lastSyncedAt) ?? 2;
      hoursToFetch = Math.min(Math.max(computed, 1), 168);
    }

    // Create sync run record
    const { data: run, error: runInsertError } = await supabase
      .from('supplier_sync_runs')
      .insert({
        tenant_id: tenantId,
        supplier_code: 'cavu',
        started_at: new Date().toISOString(),
        hours: hoursToFetch,
      })
      .select()
      .single();

    if (runInsertError) {
      console.error('[CAVU CRON] Failed to create sync run record', tenantId, runInsertError);
    }

    try {
      const result = await syncCavuEventsForTenant(tenantId, {
        hours: hoursToFetch,
      });

      // Only update last_synced_at if sync was successful (no fatal errors)
      // We consider it successful if we processed events, even if some had errors
      if (result.eventsSeen >= 0) {
        await updateLastSyncedAt(tenantId, supabase);
      }

      // Update sync run record
      if (run) {
        await supabase
          .from('supplier_sync_runs')
          .update({
            finished_at: new Date().toISOString(),
            ok: result.errors.length === 0,
            events_seen: result.eventsSeen,
            bookings_upserted: result.bookingsUpserted,
            bookings_cancelled: result.bookingsCancelled,
            errors: result.errors,
          })
          .eq('id', run.id);
      }

      logs.push({
        tenantId,
        hours: hoursToFetch,
        lastSyncedAt: lastSyncedAt || null,
        eventsSeen: result.eventsSeen,
        bookingsUpserted: result.bookingsUpserted,
        bookingsCancelled: result.bookingsCancelled,
        errors: result.errors,
      });

      totalEvents += result.eventsSeen;
      totalBookings += result.bookingsUpserted;
    } catch (err: any) {
      console.error('[CAVU CRON] Error for tenant', tenantId, err);

      // Update sync run record with error
      if (run) {
        await supabase
          .from('supplier_sync_runs')
          .update({
            finished_at: new Date().toISOString(),
            ok: false,
            events_seen: 0,
            bookings_upserted: 0,
            bookings_cancelled: 0,
            errors: [err?.message ?? String(err)],
          })
          .eq('id', run.id);
      }

      logs.push({
        tenantId,
        hours: hoursToFetch,
        lastSyncedAt: lastSyncedAt || null,
        error: err?.message ?? String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    tenantsProcessed: configs?.length ?? 0,
    totalEvents,
    totalBookings,
    logs,
  });
}

// Allow both GET and POST so it's easy to test + works with QStash
export async function GET(req: NextRequest) {
  return runCavuCron(req);
}

export async function POST(req: NextRequest) {
  return runCavuCron(req);
}
