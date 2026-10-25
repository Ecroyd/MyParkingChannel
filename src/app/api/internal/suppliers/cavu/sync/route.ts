// src/app/api/internal/suppliers/cavu/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getRecentEvents, getBookingDetails } from '@/lib/suppliers/cavu';
import { isCronRequest } from '@/lib/auth/apiGuards';
import { cancelCavuBooking, getTenantTimezone, writeCavuBooking } from '@/lib/suppliers/cavuBookingWrite';

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


const DEFAULT_HOURS = 4;

// Simple auth – you might already have internal auth middleware, reuse that instead
async function requireInternalAuth(req: NextRequest) {
  // Previously compared against `Bearer ${INTERNAL_CRON_KEY}`, which matched "Bearer undefined"
  // when the env var was unset.
  return isCronRequest(req);
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
    if (!Array.isArray(events)) {
      return NextResponse.json(
        { error: 'CAVU returned an unexpected events body (not an array)' },
        { status: 502 }
      );
    }
    const timezone = await getTenantTimezone(supabase, tenantId);

    let processed = 0;
    const errors: string[] = [];

    for (const event of events) {
      const ref = getCavuEventReference(event);
      if (!ref) continue;
      const type = String(event.EventType || '').toUpperCase();

      try {
        if (type === 'NEW' || type === 'AMEND') {
          const booking = await getBookingDetails(config, ref);
          if (!booking) continue;
          await writeCavuBooking(supabase, { tenantId, booking, timezone, mode: 'sync', reference: ref });
          processed++;
        } else if (type === 'CANCEL') {
          await cancelCavuBooking(supabase, tenantId, ref);
          processed++;
        }
        // NOSHOW events: optional, can be added later
      } catch (err: any) {
        const msg = err instanceof RangeError ? `invalid date (${err.message})` : err?.message ?? String(err);
        console.error('[CAVU] Sync event failed', ref, msg);
        errors.push(`${ref}: ${msg}`);
      }
    }

    return NextResponse.json({ ok: true, processed, events: events.length, errors });
  } catch (err: any) {
    console.error('[CAVU] Sync error', err?.message ?? err);
    return NextResponse.json(
      { error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
