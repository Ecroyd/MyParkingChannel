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

      // Heal step: if no events seen, try to heal incomplete bookings
      let healedCount = 0;
      if (result.eventsSeen === 0) {
        try {
          // Fetch up to 25 incomplete CAVU bookings
          const { data: incompleteBookings } = await supabase
            .from('bookings')
            .select('reference')
            .eq('tenant_id', tenantId)
            .eq('source', 'cavu')
            .eq('is_incomplete', true)
            .limit(25);

          if (incompleteBookings && incompleteBookings.length > 0) {
            // Import sync-booking logic directly to avoid HTTP calls
            const { getCavuConfigForTenant } = await import('@/lib/suppliers/getTenantSupplierConfig');
            const { getBookingDetails } = await import('@/lib/suppliers/cavu');
            const healConfig = await getCavuConfigForTenant(tenantId);

            if (healConfig) {
              // Heal bookings sequentially (rate-limited)
              for (const booking of incompleteBookings) {
                try {
                  const healBooking = await getBookingDetails(healConfig, booking.reference);
                  if (healBooking) {
                    // Map and upsert (same logic as sync-booking route)
                    const customerFirst = healBooking.Customer?.FirstName ?? '';
                    const customerLast = healBooking.Customer?.Surname ?? '';
                    const customerNameRaw = `${customerFirst} ${customerLast}`.trim();
                    const customerName = customerNameRaw || 'Unknown';
                    const plateRaw = healBooking.Vehicle?.Registration ?? '';
                    const plateNorm = plateRaw.replace(/\s+/g, '').toUpperCase();
                    const plate = plateNorm || 'UNKNOWN';
                    const flightDate = healBooking.ArrivalDate ? healBooking.ArrivalDate.slice(0, 10) : null;

                    function mapCavuStatus(status?: string): 'reserved' | 'checked_in' | 'checked_out' | 'cancelled' {
                      if (!status) return 'reserved';
                      const upper = status.toUpperCase();
                      if (upper.includes('CANCELLED') || upper.includes('CANCEL')) return 'cancelled';
                      if (upper.includes('CHECKED_OUT') || upper.includes('DEPARTED') || upper.includes('OUT')) return 'checked_out';
                      if (upper.includes('CHECKED_IN') || upper.includes('ARRIVED') || upper.includes('IN')) return 'checked_in';
                      if (upper.includes('CONFIRMED') || upper.includes('RESERVED')) return 'reserved';
                      return 'reserved';
                    }

                    // Compute missing fields for heal
                    const healMissingFields: string[] = [];
                    if (!customerName || customerName === 'Unknown') {
                      healMissingFields.push('customer_name');
                    }
                    if (!plate || plate === 'UNKNOWN' || plate === '') {
                      healMissingFields.push('plate');
                    }
                    if (!healBooking.Customer?.Email || healBooking.Customer.Email.trim() === '') {
                      healMissingFields.push('customer_email');
                    }
                    if (!healBooking.ArrivalDate || healBooking.ArrivalDate.trim() === '') {
                      healMissingFields.push('start_at');
                    }
                    if (!healBooking.DepartureDate || healBooking.DepartureDate.trim() === '') {
                      healMissingFields.push('end_at');
                    }

                    const healIsIncomplete = healMissingFields.length > 0;

                    const { data: healedBooking, error: healError } = await supabase
                      .from('bookings')
                      .upsert({
                        tenant_id: tenantId,
                        reference: healBooking.Reference,
                        start_at: healBooking.ArrivalDate,
                        end_at: healBooking.DepartureDate,
                        customer_name: customerName,
                        customer_email: healBooking.Customer?.Email ?? null,
                        customer_phone: healBooking.Customer?.Mobile ?? null,
                        plate: plate,
                        car_make: healBooking.Vehicle?.Make ?? null,
                        car_model: healBooking.Vehicle?.Model ?? null,
                        car_color: healBooking.Vehicle?.Colour ?? null,
                        flight_number: healBooking.OutboundFlight ?? null,
                        return_flight_number: healBooking.ReturnFlight ?? null,
                        returning_from: healBooking.ReturningFrom ?? null,
                        outbound_terminal: healBooking.OutboundTerminal ?? null,
                        return_terminal: healBooking.ReturnTerminal ?? null,
                        flight_date: flightDate,
                        source: 'cavu',
                        status: mapCavuStatus(healBooking.Status),
                        money_received: healBooking.AmountPaid ?? 0,
                        money_charged: healBooking.AmountPaid ?? 0,
                        notes: healBooking.SpecialRequests ?? null,
                        is_incomplete: healIsIncomplete,
                        missing_fields: healMissingFields,
                      } as any, {
                        onConflict: 'tenant_id,reference',
                      } as any)
                      .select('id, tenant_id, reference')
                      .single();

                    if (!healError && healedBooking?.id) {
                      // Save full booking payload to booking_external_payloads
                      await supabase
                        .from('booking_external_payloads')
                        .upsert({
                          tenant_id: tenantId,
                          booking_id: healedBooking.id,
                          source: 'cavu',
                          reference: healBooking.Reference,
                          payload: healBooking as any,
                          fetched_at: new Date().toISOString(),
                        } as any, {
                          onConflict: 'tenant_id,source,reference',
                        } as any);
                    }

                    if (!healError) {
                      healedCount++;
                    }
                  }
                  // Small delay to avoid rate limits
                  await new Promise(resolve => setTimeout(resolve, 200));
                } catch (healErr) {
                  console.warn('[CAVU CRON] Heal failed for', booking.reference, healErr);
                }
              }
            }
          }
        } catch (healErr) {
          console.warn('[CAVU CRON] Heal step error', healErr);
        }
      }

      // Update last_synced_at only after successful run (eventsSeen >= 0 means we tried)
      // Consider it successful if we processed events OR healed some bookings
      const wasSuccessful = result.eventsSeen > 0 || healedCount > 0 || result.errors.length === 0;
      if (wasSuccessful) {
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
        runId: run?.id || null,
        hours: hoursToFetch,
        lastSyncedAt: lastSyncedAt || null,
        eventsSeen: result.eventsSeen,
        bookingsUpserted: result.bookingsUpserted,
        bookingsCancelled: result.bookingsCancelled,
        healedCount,
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
  return runCavuCron(req);
}

export async function POST(req: NextRequest) {
  return runCavuCron(req);
}
