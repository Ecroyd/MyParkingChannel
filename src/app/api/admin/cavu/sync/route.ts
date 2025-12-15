// src/app/api/admin/cavu/sync/route.ts
// Client-accessible sync route that uses tenant context instead of cron key
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getRecentEvents, getBookingDetails } from '@/lib/suppliers/cavu';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';

const DEFAULT_HOURS = 24;

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

    let events: any[] = [];
    try {
      events = await getRecentEvents(config, hours);
    } catch (err: any) {
      console.error('[CAVU SYNC] Failed to get events:', err);
      // Return a user-friendly error message
      return NextResponse.json(
        { 
          error: err.message ?? 'Failed to fetch events from CAVU. The events endpoint may not be available for this operator.',
          ok: false 
        },
        { status: 400 }
      );
    }

    if (events.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        processed: 0, 
        failed: 0,
        events: 0,
        message: 'No events found in the specified time period'
      });
    }

    let processed = 0;
    let failed = 0;
    const failedReferences: string[] = [];

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

    return NextResponse.json({ 
      ok: true, 
      processed, 
      failed,
      events: events.length,
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

