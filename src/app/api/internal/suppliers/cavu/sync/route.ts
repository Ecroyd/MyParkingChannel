// src/app/api/internal/suppliers/cavu/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getRecentEvents, getBookingDetails } from '@/lib/suppliers/cavu';

const DEFAULT_HOURS = 4;

// Simple auth – you might already have internal auth middleware, reuse that instead
async function requireInternalAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || authHeader !== `Bearer ${process.env.INTERNAL_CRON_KEY}`) {
    return false;
  }
  return true;
}

export async function GET(req: NextRequest) {
  if (!(await requireInternalAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const hoursParam = req.nextUrl.searchParams.get('hours');
  const hours = hoursParam ? Number(hoursParam) : DEFAULT_HOURS;

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing tenantId' },
      { status: 400 }
    );
  }

  const config = await getCavuConfigForTenant(tenantId);
  if (!config) {
    return NextResponse.json(
      { error: 'No CAVU config for tenant' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  try {
    const events = await getRecentEvents(config, hours);

    let processed = 0;

    for (const event of events) {
      const ref = event.Reference;
      if (!ref) continue;

      if (event.EventType === 'NEW' || event.EventType === 'AMEND') {
        const booking = await getBookingDetails(config, ref);
        if (!booking) continue;

        // Map CAVU booking to your bookings schema
        const { error } = await supabase.from('bookings').upsert(
          {
            tenant_id: tenantId,
            reference: booking.Reference,
            customer_name: booking.CustomerName ?? 'Unknown',
            customer_email: booking.CustomerEmail ?? '',
            plate: booking.VehicleReg ?? '',
            car_make: booking.VehicleMake ?? null,
            car_model: booking.VehicleModel ?? null,
            car_color: booking.VehicleColour ?? null,
            start_at: booking.ArrivalDate,
            end_at: booking.DepartureDate,
            status: 'reserved', // you may want to map status from event type
            source: 'cavu',     // make sure 'cavu' exists in booking_source enum
            money_received: 0,  // CAVU doesn't provide payment info, default to 0
            money_charged: 0,   // CAVU doesn't provide payment info, default to 0
          },
          {
            onConflict: 'tenant_id,reference',
          } as any // Supabase type quirk
        );

        if (error) {
          console.error('[CAVU] Upsert booking error', error);
        } else {
          processed++;
        }
      }

      if (event.EventType === 'CANCEL') {
        const { error } = await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('tenant_id', tenantId)
          .eq('reference', ref);

        if (error) {
          console.error('[CAVU] Cancel update error', error);
        } else {
          processed++;
        }
      }

      // NOSHOW events: optional, can be added later
    }

    return NextResponse.json({ ok: true, processed, events: events.length });
  } catch (err: any) {
    console.error('[CAVU] Sync error', err);
    return NextResponse.json(
      { error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

