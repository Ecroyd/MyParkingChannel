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
        source: 'cavu', // make sure this exists in booking_source enum
        status: 'reserved', // or map from booking if they send a status later
        money_received: 0,
        money_charged: 0,
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

