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
import { cancelCavuBooking, getTenantTimezone, writeCavuBooking } from './cavuBookingWrite';
import { CavuEventOutcome, classifyCavuError } from './cavuCursor';

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
  /** False when the event list could not be fetched or was not an array: don't move the cursor. */
  fetchOk: boolean;
  /** When the event list request was made (the cursor moves to here when everything is done). */
  fetchStartedAt: string;
  /** One entry per event; 'transient' ones (and any not reached) must be retried. */
  outcomes: CavuEventOutcome[];
  /** Tenant timezone used for time conversion. */
  timezone: string;
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
  const timezone = await getTenantTimezone(supabase, tenantId);
  const errors: string[] = [];
  const outcomes: CavuEventOutcome[] = [];

  let bookingsUpserted = 0;
  let bookingsCancelled = 0;

  const fetchStartedAt = new Date().toISOString();
  const base = { tenantId, hours, fetchStartedAt, timezone };

  // 1) Fetch events for the last X hours (single API call)
  let raw: unknown;
  try {
    raw = await getEventsByAge(config, hours);
  } catch (err: any) {
    errors.push(`GetEventsByAge failed for last ${hours} hours: ${err?.message ?? String(err)}`);
    return { ...base, eventsSeen: 0, bookingsUpserted: 0, bookingsCancelled: 0, errors, fetchOk: false, outcomes };
  }

  // A 200 whose body isn't a list is not "no events": treat it as a failed fetch so the cursor
  // stays put and the window is re-read next run.
  if (!Array.isArray(raw)) {
    const kind = raw === null ? 'null' : typeof raw;
    errors.push(`GetEventsByAge returned an unexpected body (${kind}, not an array) for last ${hours} hours`);
    return { ...base, eventsSeen: 0, bookingsUpserted: 0, bookingsCancelled: 0, errors, fetchOk: false, outcomes };
  }

  const events = raw as CavuEvent[];
  const eventsSeen = events.length;
  const seenRefs = new Set<string>();
  let stopReason: string | null = null;

  for (const ev of events) {
    const eventDate = typeof (ev as any)?.EventDate === 'string' ? (ev as any).EventDate : null;
    const ref = getCavuEventReference(ev);

    if (stopReason) {
      // Not attempted (rate limited): must be retried next run.
      outcomes.push({ reference: ref, eventDate, status: 'transient' });
      continue;
    }

    if (!ref) {
      const eventId = (ev as any)?.EventID ?? (ev as any)?.eventId ?? (ev as any)?.id ?? 'unknown';
      errors.push(`Event ${eventId} missing Reference (keys: ${Object.keys(ev ?? {}).join(', ')})`);
      outcomes.push({ reference: null, eventDate, status: 'permanent' });
      continue;
    }

    if (seenRefs.has(ref)) {
      outcomes.push({ reference: ref, eventDate, status: 'ok' });
      continue;
    }
    seenRefs.add(ref);

    const type = String(ev.EventType || '').toUpperCase();

    try {
      if (type === 'CANCEL') {
        await cancelCavuBooking(supabase, tenantId, ref);
        bookingsCancelled++;
        outcomes.push({ reference: ref, eventDate, status: 'ok' });
        continue;
      }

      // For NEW / AMEND / anything else, fetch booking details
      let booking: CavuBooking | null = null;
      try {
        booking = await getBookingDetails(config, ref);
      } catch (err: any) {
        const msg = err?.message ?? String(err);
        errors.push(`GetBookingDetails failed for ${ref}: ${msg}`);
        outcomes.push({ reference: ref, eventDate, status: classifyCavuError(err) });
        if (err?.code === 'CAVU_RATE_LIMIT' || msg.includes('429')) {
          // Rate limit hit: stop processing to avoid spamming; the rest are retried next run.
          stopReason = 'rate_limited';
        }
        continue;
      }

      if (!booking) {
        errors.push(`No booking details returned for ${ref}`);
        outcomes.push({ reference: ref, eventDate, status: 'permanent' });
        continue;
      }

      await writeCavuBooking(supabase, { tenantId, booking, timezone, mode: 'sync', reference: ref });
      bookingsUpserted++;
      outcomes.push({ reference: ref, eventDate, status: 'ok' });
    } catch (err: any) {
      // Includes RangeError from an impossible ArrivalDate/DepartureDate: one bad event must not
      // abort the tenant run.
      const kind = classifyCavuError(err);
      const msg = err instanceof RangeError ? `invalid date (${err.message})` : err?.message ?? String(err);
      console.error('[CAVU SYNC] Event failed', ref, kind, msg);
      errors.push(`Upsert failed for ${ref}: ${msg}`);
      outcomes.push({ reference: ref, eventDate, status: kind });
    }
  }

  return {
    ...base,
    eventsSeen,
    bookingsUpserted,
    bookingsCancelled,
    errors,
    fetchOk: true,
    outcomes,
  };
}
