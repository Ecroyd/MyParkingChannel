// src/app/api/internal/suppliers/cavu/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getRecentEvents, getBookingDetails } from '@/lib/suppliers/cavu';

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
      const ref = getCavuEventReference(event);
      if (!ref) continue;

      if (event.EventType === 'NEW' || event.EventType === 'AMEND') {
        const booking = await getBookingDetails(config, ref);
        if (!booking) continue;

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

        // Map CAVU booking to your bookings schema
        const { error } = await supabase.from('bookings').upsert(
          {
            tenant_id: tenantId,
            reference: booking.Reference,
            customer_name: customerName,
            customer_email: booking.Customer?.Email ?? null,
            plate: plate,
            car_make: booking.Vehicle?.Make ?? null,
            car_model: booking.Vehicle?.Model ?? null,
            car_color: booking.Vehicle?.Colour ?? null,
            start_at: booking.ArrivalDate,
            end_at: booking.DepartureDate,
            status: mapCavuStatus(booking.Status),
            source: 'cavu',
            money_received: 0,
            money_charged: 0,
            notes: booking.SpecialRequests ?? null,
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

