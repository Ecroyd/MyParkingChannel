// src/lib/suppliers/cavuEventsSync.ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from './getTenantSupplierConfig';
import {
  getEventsByAge,
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

/**
 * Robustly extract booking reference from a CAVU event.
 * Checks multiple possible property names and nested structures.
 */
function getCavuEventReference(event: any): string | null {
  // Try direct properties first
  if (event.Reference && typeof event.Reference === 'string' && event.Reference.trim()) {
    return event.Reference.trim();
  }
  if (event.BookingReference && typeof event.BookingReference === 'string' && event.BookingReference.trim()) {
    return event.BookingReference.trim();
  }
  if (event.BookingRef && typeof event.BookingRef === 'string' && event.BookingRef.trim()) {
    return event.BookingRef.trim();
  }
  if (event.ReferenceNumber && typeof event.ReferenceNumber === 'string' && event.ReferenceNumber.trim()) {
    return event.ReferenceNumber.trim();
  }
  
  // Try nested structures
  if (event.Booking?.Reference && typeof event.Booking.Reference === 'string' && event.Booking.Reference.trim()) {
    return event.Booking.Reference.trim();
  }
  if (event.booking?.reference && typeof event.booking.reference === 'string' && event.booking.reference.trim()) {
    return event.booking.reference.trim();
  }
  
  // Try lowercase variants
  if (event.reference && typeof event.reference === 'string' && event.reference.trim()) {
    return event.reference.trim();
  }
  if (event.bookingReference && typeof event.bookingReference === 'string' && event.bookingReference.trim()) {
    return event.bookingReference.trim();
  }
  
  return null;
}

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

  // 1) Fetch events for the last X hours (single API call)
  try {
    events = await getEventsByAge(config, hours);
  } catch (err: any) {
    errors.push(
      `GetEventsByAge failed for last ${hours} hours: ${
        err?.message ?? String(err)
      }`
    );
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
    // TEMP: Log first event structure for debugging
    if (seenRefs.size === 0) {
      console.log('[CAVU SYNC DEBUG] First event keys:', Object.keys(ev));
      console.log('[CAVU SYNC DEBUG] First event full structure:', JSON.stringify(ev, null, 2));
    }

    const ref = getCavuEventReference(ev);
    if (!ref) {
      const eventId = (ev as any).EventID ?? (ev as any).eventId ?? (ev as any).id ?? 'unknown';
      errors.push(`Event ${eventId} missing Reference (keys: ${Object.keys(ev).join(', ')})`);
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

      if (msg.includes('429')) {
        // Rate limit hit: stop processing to avoid spamming
        break;
      }

      continue;
    }

    if (!booking) {
      errors.push(`No booking details returned for ${ref}`);
      continue;
    }

    // Map customer name from nested structure
    const customerFirst = booking.Customer?.FirstName ?? '';
    const customerLast = booking.Customer?.Surname ?? '';
    const customerNameRaw = `${customerFirst} ${customerLast}`.trim();
    const customerName = customerNameRaw || 'Unknown';

    // Normalize plate: uppercase, remove spaces
    const plateRaw = booking.Vehicle?.Registration ?? '';
    const plateNorm = plateRaw.replace(/\s+/g, '').toUpperCase();
    const plate = plateNorm || 'UNKNOWN';

    // Map status from CAVU Status
    function mapCavuStatus(status?: string): 'reserved' | 'checked_in' | 'checked_out' | 'cancelled' {
      if (!status) return 'reserved';
      const upper = status.toUpperCase();
      if (upper.includes('CANCELLED') || upper.includes('CANCEL')) return 'cancelled';
      if (upper.includes('CHECKED_OUT') || upper.includes('DEPARTED') || upper.includes('OUT')) return 'checked_out';
      if (upper.includes('CHECKED_IN') || upper.includes('ARRIVED') || upper.includes('IN')) return 'checked_in';
      if (upper.includes('CONFIRMED') || upper.includes('RESERVED')) return 'reserved';
      return 'reserved'; // Default
    }

    // Extract flight_date from ArrivalDate (YYYY-MM-DD format)
    const flightDate = booking.ArrivalDate ? booking.ArrivalDate.slice(0, 10) : null;

    const row = {
      tenant_id: tenantId,
      reference: booking.Reference,
      start_at: booking.ArrivalDate,
      end_at: booking.DepartureDate,
      customer_name: customerName,
      customer_email: booking.Customer?.Email ?? null,
      customer_phone: booking.Customer?.Mobile ?? null,
      plate: plate,
      car_make: booking.Vehicle?.Make ?? null,
      car_model: booking.Vehicle?.Model ?? null,
      car_color: booking.Vehicle?.Colour ?? null,
      flight_number: booking.OutboundFlight ?? null,
      flight_date: flightDate,
      source: 'cavu',
      status: mapCavuStatus(booking.Status),
      money_received: booking.AmountPaid ?? 0,
      money_charged: booking.AmountPaid ?? 0,
      notes: booking.SpecialRequests ?? null,
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

