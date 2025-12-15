// src/lib/suppliers/cavuEventsSync.ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from './getTenantSupplierConfig';
import {
  getRecentEvents,
  getBookingDetails,
  CavuBooking,
  CavuEvent,
} from './cavu';

export type CavuEventsSyncOptions = {
  hours?: number; // how far back to look
};

export type CavuEventsSyncResult = {
  tenantId: string;
  hours: number;
  eventsSeen: number;
  bookingsUpserted: number;
  bookingsCancelled: number;
  errors: string[];
};

export async function syncCavuEventsForTenant(
  tenantId: string,
  opts: CavuEventsSyncOptions = {}
): Promise<CavuEventsSyncResult> {
  const hours = opts.hours ?? 2; // default: last 2 hours

  const config = await getCavuConfigForTenant(tenantId);
  if (!config) {
    throw new Error('No CAVU config for tenant');
  }

  const supabase = createAdminClient();
  const errors: string[] = [];

  let eventsSeen = 0;
  let bookingsUpserted = 0;
  let bookingsCancelled = 0;

  let events: CavuEvent[] = [];

  try {
    events = await getRecentEvents(config, hours);
  } catch (err: any) {
    // If events endpoint returns 404, it's not available for this operator
    if (err.message?.includes('404') || err.message?.includes('Events endpoint not available')) {
      errors.push(
        `Events endpoint not available for this operator. Try using arrivals-based sync instead.`
      );
    } else {
      errors.push(
        `GetEventsByAge failed for last ${hours} hours: ${
          err?.message ?? String(err)
        }`
      );
    }
    return {
      tenantId,
      hours,
      eventsSeen: 0,
      bookingsUpserted: 0,
      bookingsCancelled: 0,
      errors,
    };
  }

  if (!Array.isArray(events) || events.length === 0) {
    return {
      tenantId,
      hours,
      eventsSeen: 0,
      bookingsUpserted: 0,
      bookingsCancelled: 0,
      errors,
    };
  }

  eventsSeen = events.length;

  const seenRefs = new Set<string>();

  for (const ev of events) {
    const ref = ev.Reference;
    if (!ref) {
      errors.push(`Event ${ev.EventID} missing Reference`);
      continue;
    }

    if (seenRefs.has(ref)) continue;
    seenRefs.add(ref);

    const type = (ev.EventType || '').toUpperCase();

    if (type === 'CANCEL') {
      // mark as cancelled in our DB
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('tenant_id', tenantId)
        .eq('reference', ref);

      if (error) {
        errors.push(`Failed to cancel booking ${ref}: ${error.message}`);
      } else {
        bookingsCancelled++;
      }

      continue;
    }

    // For NEW / AMEND / anything else, fetch booking details
    let booking: CavuBooking | null = null;
    try {
      booking = await getBookingDetails(config, ref);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      errors.push(`GetBookingDetails failed for ${ref}: ${msg}`);

      if (err?.code === 'CAVU_RATE_LIMIT' || msg.includes('429')) {
        // Rate limit hit: stop processing further to avoid spamming
        break;
      }

      continue;
    }

    if (!booking) {
      errors.push(`No booking details returned for ${ref}`);
      continue;
    }

    const row = {
      tenant_id: tenantId,
      reference: booking.Reference,
      start_at: booking.ArrivalDate,
      end_at: booking.DepartureDate,
      customer_name: booking.CustomerName ?? 'Unknown',
      customer_email: booking.CustomerEmail ?? '',
      plate: booking.VehicleReg ?? '',
      car_make: booking.VehicleMake ?? null,
      car_model: booking.VehicleModel ?? null,
      car_color: booking.VehicleColour ?? null,
      source: 'cavu', // make sure 'cavu' exists in booking_source enum
      status: 'reserved', // you can refine this later if CAVU sends a status
      money_received: 0,
      money_charged: 0,
    };

    const { error } = await supabase
      .from('bookings')
      .upsert(row as any, {
        onConflict: 'tenant_id,reference',
      } as any);

    if (error) {
      errors.push(`Upsert failed for ${ref}: ${error.message}`);
    } else {
      bookingsUpserted++;
    }
  }

  return {
    tenantId,
    hours,
    eventsSeen,
    bookingsUpserted,
    bookingsCancelled,
    errors,
  };
}

