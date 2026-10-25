import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { syncCavuEventsForTenant } from '@/lib/suppliers/cavuEventsSync';
import { createSyncAlert, getAlertRoutes } from '@/lib/suppliers/alerting';
import { deliverAlert } from '@/lib/suppliers/alertDelivery';
import { logRequestAttribution, validateCronAuth } from '@/lib/jobSecret';
import { writeCavuHealthForTenant } from '@/lib/health/cavuWrite';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getBookingDetails } from '@/lib/suppliers/cavu';
import { writeCavuBooking } from '@/lib/suppliers/cavuBookingWrite';
import { decideCavuCursor } from '@/lib/suppliers/cavuCursor';

// Parsing/sync can take a while; allow up to 5 minutes (Vercel Pro).
export const maxDuration = 300;

const BOOKING_SOURCE = 'cavu';

// Heal step limits: only bookings that haven't finished more than HEAL_LOOKBACK_DAYS ago, at most
// HEAL_BATCH per quiet run, and a booking whose CAVU payload was fetched in the last
// HEAL_RETRY_HOURS is skipped (booking_external_payloads.fetched_at is our "last attempt" marker).
const HEAL_BATCH = 25;
const HEAL_CANDIDATES = 200;
const HEAL_LOOKBACK_DAYS = 2;
const HEAL_RETRY_HOURS = 24;

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
async function updateLastSyncedAt(
  tenantId: string,
  supabase: ReturnType<typeof createAdminClient>,
  cursor: string
) {
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
    last_synced_at: cursor,
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


async function healIncompleteBookings(
  tenantId: string,
  supabase: ReturnType<typeof createAdminClient>,
  timezone: string
): Promise<number> {
  const sinceEnd = new Date(Date.now() - HEAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: candidates, error } = await supabase
    .from('bookings')
    .select('reference')
    .eq('tenant_id', tenantId)
    .eq('source', BOOKING_SOURCE)
    .eq('is_incomplete', true)
    .gte('end_at', sinceEnd)
    .order('start_at', { ascending: true })
    .limit(HEAL_CANDIDATES);
  if (error) throw error;
  const refs = (candidates ?? []).map((b: any) => b.reference as string).filter(Boolean);
  if (refs.length === 0) return 0;

  const retryAfter = new Date(Date.now() - HEAL_RETRY_HOURS * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('booking_external_payloads')
    .select('reference')
    .eq('tenant_id', tenantId)
    .eq('source', BOOKING_SOURCE)
    .in('reference', refs)
    .gte('fetched_at', retryAfter);
  const recentlyFetched = new Set((recent ?? []).map((r: any) => r.reference as string));
  const toHeal = refs.filter((r) => !recentlyFetched.has(r)).slice(0, HEAL_BATCH);
  if (toHeal.length === 0) return 0;

  const config = await getCavuConfigForTenant(tenantId);
  if (!config) return 0;

  let healed = 0;
  for (const reference of toHeal) {
    try {
      const booking = await getBookingDetails(config, reference);
      if (booking) {
        const res = await writeCavuBooking(supabase, { tenantId, booking, timezone, mode: 'heal', reference });
        if (res.action === 'updated') healed++;
      }
    } catch (err: any) {
      console.warn('[CAVU CRON] Heal failed for', reference, err?.message ?? err);
      if (err?.code === 'CAVU_RATE_LIMIT') break;
    }
    // Small delay to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return healed;
}

async function runCavuCron(req?: NextRequest) {
  const supabase = createAdminClient();

  // Get optional hours param from query string (for testing/backfill)
  const url = req?.nextUrl;
  const hoursParam = Number(url?.searchParams.get('hours'));
  const hasExplicitHours = Number.isFinite(hoursParam) && hoursParam > 0;

  // Detect trigger source
  const triggerSource = req?.method === 'POST' ? 'qstash' : 'manual';
  const requestId = req?.headers.get('x-request-id') || req?.headers.get('x-qstash-message-id') || null;

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

    // Check for stale run (no successful run in > 2 hours)
    const { data: lastSuccessfulRun } = await supabase
      .from('supplier_sync_runs')
      .select('started_at')
      .eq('tenant_id', tenantId)
      .eq('supplier_code', 'cavu')
      .eq('ok', true)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const isStale = !lastSuccessfulRun || new Date(lastSuccessfulRun.started_at) < twoHoursAgo;

    if (isStale) {
      // Create stale run warning alert with special fingerprint: stale|2h
      const fingerprint = 'stale|2h';
      const errorMessage = 'No successful sync run in the last 2 hours';
      
      // Try to insert directly with the special fingerprint
      const { data: staleAlert, error: insertError } = await supabase
        .from('supplier_sync_alerts')
        .insert({
          tenant_id: tenantId,
          supplier_code: 'cavu',
          run_id: null,
          fingerprint,
          severity: 'warning',
          message: errorMessage,
          meta: {
            errors: [errorMessage],
          },
        })
        .select('id, fingerprint')
        .single();

      // If insert succeeded (not a duplicate), deliver the alert
      if (staleAlert && !insertError) {
        const routes = await getAlertRoutes(tenantId);
        if (routes.length > 0) {
          await deliverAlert(staleAlert.id, routes, {
            tenantId,
            supplierCode: 'cavu',
            startedAt: now.toISOString(),
            errors: [errorMessage],
            runId: null,
          });
        }
      }
    }

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

    try {
      await writeCavuHealthForTenant(tenantId, { status: 'running', last_error: null });
    } catch (e) {
      console.warn('[CAVU CRON] Failed to write running health', tenantId, e);
    }

    // Create sync run record
    const { data: run, error: runInsertError } = await supabase
      .from('supplier_sync_runs')
      .insert({
        tenant_id: tenantId,
        supplier_code: 'cavu',
        started_at: new Date().toISOString(),
        hours: hoursToFetch,
        meta: {
          trigger_source: triggerSource,
          request_id: requestId,
        },
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

      // Heal step: if no events seen, fill blanks on incomplete bookings (never times/status/money).
      let healedCount = 0;
      if (result.fetchOk && result.eventsSeen === 0) {
        try {
          healedCount = await healIncompleteBookings(tenantId, supabase, result.timezone);
        } catch (healErr: any) {
          console.warn('[CAVU CRON] Heal step error', healErr?.message ?? healErr);
        }
      }

      // Cursor: move past events that succeeded or failed permanently (they stay in the run's
      // errors), but not past transient failures (network / 5xx / 429), which are retried.
      // A failed or malformed event-list fetch never moves it. Window is still capped at 168h.
      const cursorDecision = decideCavuCursor({
        fetchOk: result.fetchOk,
        fetchStartedAt: new Date(result.fetchStartedAt),
        previousCursor: lastSyncedAt ?? null,
        outcomes: result.outcomes,
        timezone: result.timezone,
      });
      if (cursorDecision.advance) {
        await updateLastSyncedAt(tenantId, supabase, cursorDecision.cursor);
      }

      // Update sync run record
      const runOk = result.errors.length === 0;
      if (run) {
        await supabase
          .from('supplier_sync_runs')
          .update({
            finished_at: new Date().toISOString(),
            ok: runOk,
            events_seen: result.eventsSeen,
            bookings_upserted: result.bookingsUpserted,
            bookings_cancelled: result.bookingsCancelled,
            errors: result.errors,
          })
          .eq('id', run.id);
      }

      // Create and deliver alerts if run failed or has errors
      if (!runOk || result.errors.length > 0) {
        const alert = await createSyncAlert({
          tenantId,
          supplierCode: 'cavu',
          runId: run?.id || null,
          errors: result.errors,
          severity: 'error',
        });

        if (alert) {
          // Only deliver if alert was created (not a duplicate)
          const routes = await getAlertRoutes(tenantId);
          if (routes.length > 0) {
            await deliverAlert(alert.id, routes, {
              tenantId,
              supplierCode: 'cavu',
              startedAt: run?.started_at || new Date().toISOString(),
              errors: result.errors,
              runId: run?.id || null,
            });
          }
        }
      }

      logs.push({
        tenantId,
        runId: run?.id || null,
        hours: hoursToFetch,
        lastSyncedAt: lastSyncedAt || null,
        eventsSeen: result.eventsSeen,
        bookingsUpserted: result.bookingsUpserted,
        bookingsCancelled: result.bookingsCancelled,
        healedCount,
        cursor: cursorDecision.advance ? cursorDecision.cursor : lastSyncedAt || null,
        cursorReason: cursorDecision.reason,
        errors: result.errors,
      });

      totalEvents += result.eventsSeen;
      totalBookings += result.bookingsUpserted;

      try {
        await writeCavuHealthForTenant(tenantId, {
          status: runOk ? 'success' : 'failed',
          last_error: runOk ? null : result.errors[0] ?? 'Sync completed with errors',
        });
      } catch (e) {
        console.warn('[CAVU CRON] Failed to write success health', tenantId, e);
      }
    } catch (err: any) {
      console.error('[CAVU CRON] Error for tenant', tenantId, err);

      // Update sync run record with error
      const errorMessage = err?.message ?? String(err);

      try {
        await writeCavuHealthForTenant(tenantId, {
          status: 'failed',
          last_error: errorMessage,
        });
      } catch (e) {
        console.warn('[CAVU CRON] Failed to write failed health', tenantId, e);
      }
      if (run) {
        await supabase
          .from('supplier_sync_runs')
          .update({
            finished_at: new Date().toISOString(),
            ok: false,
            events_seen: 0,
            bookings_upserted: 0,
            bookings_cancelled: 0,
            errors: [errorMessage],
          })
          .eq('id', run.id);
      }

      // Create and deliver alert for exception
      const alert = await createSyncAlert({
        tenantId,
        supplierCode: 'cavu',
        runId: run?.id || null,
        errors: [errorMessage],
        severity: 'error',
      });

      if (alert) {
        const routes = await getAlertRoutes(tenantId);
        if (routes.length > 0) {
          await deliverAlert(alert.id, routes, {
            tenantId,
            supplierCode: 'cavu',
            startedAt: run?.started_at || new Date().toISOString(),
            errors: [errorMessage],
            runId: run?.id || null,
          });
        }
      }

      logs.push({
        tenantId,
        runId: run?.id || null,
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
  logRequestAttribution(req, '/api/internal/suppliers/cavu/cron');
  if (!validateCronAuth(req)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return runCavuCron(req);
}

export async function POST(req: NextRequest) {
  logRequestAttribution(req, '/api/internal/suppliers/cavu/cron');
  const hasSecret = validateCronAuth(req);
  const ctx = await getCurrentTenantContext();
  const hasAdminSession = ctx && (ctx.role === 'admin' || ctx.role === 'owner');
  if (!hasSecret && !hasAdminSession) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return runCavuCron(req);
}
