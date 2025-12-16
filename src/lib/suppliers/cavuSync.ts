// src/lib/suppliers/cavuSync.ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { getCavuConfigForTenant } from './getTenantSupplierConfig';
import { getArrivalsForDate, getBookingDetails, CavuBooking } from './cavu';

export type CavuSyncOptions = {
  daysPast?: number;
  daysFuture?: number;
};

export type CavuSyncResult = {
  tenantId: string;
  daysPast: number;
  daysFuture: number;
  datesProcessed: string[];
  totalArrivalsSeen: number;
  bookingsUpserted: number;
  errors: string[];
};

function formatDateUtc(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function addDays(date: Date, offset: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

export async function syncCavuArrivalsForTenant(
  tenantId: string,
  opts: CavuSyncOptions = {}
): Promise<CavuSyncResult> {
  const daysPast = opts.daysPast ?? 1;
  const daysFuture = opts.daysFuture ?? 30;

  const config = await getCavuConfigForTenant(tenantId);
  if (!config) {
    throw new Error('No CAVU config for tenant');
  }

  const supabase = createAdminClient();
  const today = new Date();
  const seenRefs = new Set<string>();
  const datesProcessed: string[] = [];
  const errors: string[] = [];

  let totalArrivalsSeen = 0;
  let bookingsUpserted = 0;

  // Loop from -daysPast to +daysFuture (inclusive)
  for (let offset = -daysPast; offset <= daysFuture; offset++) {
    const date = addDays(today, offset);
    const dateStr = formatDateUtc(date);
    datesProcessed.push(dateStr);

    let arrivals: any[] = [];
    try {
      arrivals = await getArrivalsForDate(config, dateStr);
    } catch (err: any) {
      if (err?.code === 'CAVU_RATE_LIMIT') {
        const msg = `Rate limited by CAVU after ${datesProcessed.length} dates: ${err.message}`;
        console.warn('[CAVU SYNC]', msg);
        errors.push(msg);
        // Stop processing more dates – we hit their limit
        break;
      }

      console.warn(
        '[CAVU SYNC] Arrivals fetch failed for date',
        dateStr,
        err?.message ?? err
      );
      errors.push(
        `Arrivals fetch failed for ${dateStr}: ${err?.message ?? String(err)}`
      );
      continue;
    }

    if (!Array.isArray(arrivals) || arrivals.length === 0) {
      continue;
    }

    totalArrivalsSeen += arrivals.length;

    for (const arrival of arrivals) {
      const ref =
        arrival.Reference ??
        arrival.BookingReference ??
        arrival.Ref ??
        null;

      if (!ref) {
        errors.push(`Arrival on ${dateStr} missing reference`);
        continue;
      }

      if (seenRefs.has(ref)) {
        continue; // already processed this booking from another date
      }
      seenRefs.add(ref);

      let booking: CavuBooking | null = null;
      try {
        booking = await getBookingDetails(config, ref);
      } catch (err: any) {
        errors.push(`GetBookingDetails failed for ${ref}: ${err?.message ?? String(err)}`);
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

      // Compute missing fields
      const missingFields: string[] = [];
      if (!customerName || customerName === 'Unknown') {
        missingFields.push('customer_name');
      }
      if (!plate || plate === 'UNKNOWN' || plate === '') {
        missingFields.push('plate');
      }
      if (!booking.Customer?.Email || booking.Customer.Email.trim() === '') {
        missingFields.push('customer_email');
      }
      if (!booking.ArrivalDate || booking.ArrivalDate.trim() === '') {
        missingFields.push('start_at');
      }
      if (!booking.DepartureDate || booking.DepartureDate.trim() === '') {
        missingFields.push('end_at');
      }

      const isIncomplete = missingFields.length > 0;

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
        is_incomplete: isIncomplete,
        missing_fields: missingFields,
      };

      const { error } = await supabase
        .from('bookings')
        .upsert(row as any, {
          onConflict: 'tenant_id,reference',
        } as any);

      if (error) {
        console.error('[CAVU SYNC] Upsert failed for', ref, error);
        errors.push(`Upsert failed for ${ref}: ${error.message}`);
      } else {
        bookingsUpserted++;
      }
    }
  }

  return {
    tenantId,
    daysPast,
    daysFuture,
    datesProcessed,
    totalArrivalsSeen,
    bookingsUpserted,
    errors,
  };
}

