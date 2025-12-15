// src/app/api/admin/cavu/sync/route.ts
// Client-accessible sync route that uses tenant context instead of cron key
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getRecentEvents, getBookingDetails, getArrivalsForDate } from '@/lib/suppliers/cavu';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';

const DEFAULT_HOURS = 24;
const DEFAULT_DAYS_BACK = 1; // Sync yesterday and today by default

export async function POST(req: NextRequest) {
  try {
    // Get tenant context from authenticated user
    const ctx = await getCurrentTenantContext();
    if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const hours = body.hours ? Number(body.hours) : DEFAULT_HOURS;

    const config = await getCavuConfigForTenant(ctx.tenantId);
    if (!config) {
      return NextResponse.json(
        { error: 'No CAVU config for tenant' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    let processed = 0;
    let failed = 0;
    const failedReferences: string[] = [];
    let syncMethod = 'events';
    let totalItems = 0;

    // Try events-based sync first
    let events: any[] = [];
    try {
      events = await getRecentEvents(config, hours);
      totalItems = events.length;
      
      // Process events
      for (const event of events) {
        const ref = event.Reference;
        if (!ref) continue;

        try {
          if (event.EventType === 'NEW' || event.EventType === 'AMEND') {
            const booking = await getBookingDetails(config, ref);
            if (!booking) {
              failed++;
              failedReferences.push(ref);
              continue;
            }

            // Map CAVU booking to your bookings schema
            const { error } = await supabase.from('bookings').upsert(
              {
                tenant_id: ctx.tenantId,
                reference: booking.Reference,
                customer_name: booking.CustomerName ?? 'Unknown',
                customer_email: booking.CustomerEmail ?? '',
                plate: booking.VehicleReg ?? '',
                car_make: booking.VehicleMake ?? null,
                car_model: booking.VehicleModel ?? null,
                car_color: booking.VehicleColour ?? null,
                start_at: booking.ArrivalDate,
                end_at: booking.DepartureDate,
                status: 'reserved',
                source: 'cavu',
                money_received: 0,
                money_charged: 0,
              },
              {
                onConflict: 'tenant_id,reference',
              } as any
            );

            if (error) {
              console.error('[CAVU] Upsert booking error', error, 'Reference:', ref);
              failed++;
              failedReferences.push(ref);
            } else {
              processed++;
            }
          }

          if (event.EventType === 'CANCEL') {
            const { error } = await supabase
              .from('bookings')
              .update({ status: 'cancelled' })
              .eq('tenant_id', ctx.tenantId)
              .eq('reference', ref);

            if (error) {
              console.error('[CAVU] Cancel update error', error, 'Reference:', ref);
              failed++;
              failedReferences.push(ref);
            } else {
              processed++;
            }
          }
        } catch (err: any) {
          console.error('[CAVU] Error processing event', err, 'Reference:', ref);
          failed++;
          failedReferences.push(ref);
        }
      }
    } catch (err: any) {
      // Events endpoint failed, try arrivals-based sync as fallback
      console.warn('[CAVU SYNC] Events endpoint failed, trying arrivals-based sync:', err.message);
      syncMethod = 'arrivals';
      
      try {
        // Sync arrivals for today and past N days
        const today = new Date();
        const datesToSync: string[] = [];
        
        for (let i = 0; i <= DEFAULT_DAYS_BACK; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i);
          datesToSync.push(date.toISOString().slice(0, 10)); // YYYY-MM-DD
        }

        const allArrivals: any[] = [];
        for (const date of datesToSync) {
          try {
            const arrivals = await getArrivalsForDate(config, date);
            if (Array.isArray(arrivals)) {
              allArrivals.push(...arrivals);
            }
          } catch (dateErr: any) {
            // If arrivals endpoint also fails for a date, log but continue
            console.warn(`[CAVU SYNC] Failed to get arrivals for ${date}:`, dateErr.message);
          }
        }

        totalItems = allArrivals.length;
        
        // Process arrivals (treat them all as NEW bookings)
        const seenReferences = new Set<string>();
        for (const arrival of allArrivals) {
          const ref = arrival.Reference || arrival.ReferenceNumber;
          if (!ref || seenReferences.has(ref)) continue; // Skip duplicates
          seenReferences.add(ref);

          try {
            const booking = await getBookingDetails(config, ref);
            if (!booking) {
              failed++;
              failedReferences.push(ref);
              continue;
            }

            // Map CAVU booking to your bookings schema
            const { error } = await supabase.from('bookings').upsert(
              {
                tenant_id: ctx.tenantId,
                reference: booking.Reference,
                customer_name: booking.CustomerName ?? 'Unknown',
                customer_email: booking.CustomerEmail ?? '',
                plate: booking.VehicleReg ?? '',
                car_make: booking.VehicleMake ?? null,
                car_model: booking.VehicleModel ?? null,
                car_color: booking.VehicleColour ?? null,
                start_at: booking.ArrivalDate,
                end_at: booking.DepartureDate,
                status: 'reserved',
                source: 'cavu',
                money_received: 0,
                money_charged: 0,
              },
              {
                onConflict: 'tenant_id,reference',
              } as any
            );

            if (error) {
              console.error('[CAVU] Upsert booking error', error, 'Reference:', ref);
              failed++;
              failedReferences.push(ref);
            } else {
              processed++;
            }
          } catch (err: any) {
            console.error('[CAVU] Error processing arrival', err, 'Reference:', ref);
            failed++;
            failedReferences.push(ref);
          }
        }
      } catch (arrivalsErr: any) {
        // Both methods failed
        return NextResponse.json(
          { 
            error: `Both sync methods failed. Events: ${err.message}. Arrivals: ${arrivalsErr.message}`,
            ok: false 
          },
          { status: 400 }
        );
      }
    }

    if (totalItems === 0) {
      return NextResponse.json({ 
        ok: true, 
        processed: 0, 
        failed: 0,
        events: 0,
        syncMethod,
        message: `No bookings found using ${syncMethod} method`
      });
    }

    return NextResponse.json({ 
      ok: true, 
      processed, 
      failed,
      events: totalItems,
      syncMethod,
      failedReferences: failedReferences.slice(0, 10), // Limit to first 10 for response size
    });
  } catch (err: any) {
    console.error('[CAVU] Sync error', err);
    return NextResponse.json(
      { error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}


