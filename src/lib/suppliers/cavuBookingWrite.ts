// src/lib/suppliers/cavuBookingWrite.ts
//
// The one place CAVU bookings are written to the DB. Every CAVU path (events sync, cron heal,
// arrivals sync, manual sync, sync-booking) goes through here so they map times/status/money the
// same way and never undo what the gate has recorded.
import 'server-only';
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/datetime/parse';
import type { CavuBooking } from './cavu';
import {
  CAVU_BOOKING_CONFLICT_TARGET,
  CAVU_BOOKING_SOURCE,
  CAVU_SUPPLIER_CODE,
  EXISTING_BOOKING_COLUMNS,
  ExistingBooking,
  buildHealPatch,
  buildSyncPatch,
  mapCavuBooking,
} from './cavuBookingMapper';

// Loosely typed: callers pass either the admin client from '@/lib/supabase/server' or '/admin'.
type Db = { from: (table: string) => any };

export class CavuWriteError extends Error {
  /** Postgres SQLSTATE / PostgREST code, used by classifyCavuError. */
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'CavuWriteError';
    this.code = code;
  }
}

export function formatCavuDbError(
  tableName: string,
  reference: string,
  error: { message?: string; code?: string } | null
) {
  return [
    `supplier_code=${CAVU_SUPPLIER_CODE}`,
    `reference=${reference}`,
    `table=${tableName}`,
    `conflict_target=${CAVU_BOOKING_CONFLICT_TARGET}`,
    `postgres_error=${error?.message ?? 'Unknown Postgres error'}`,
  ].join(' ');
}

export async function getTenantTimezone(db: Db, tenantId: string): Promise<string> {
  try {
    const { data } = await db.from('tenants').select('timezone').eq('id', tenantId).maybeSingle();
    const tz = (data as { timezone?: string | null } | null)?.timezone;
    return tz && tz.trim() ? tz : DEFAULT_TENANT_TIMEZONE;
  } catch {
    return DEFAULT_TENANT_TIMEZONE;
  }
}

export type CavuWriteResult = {
  bookingId: string | null;
  action: 'inserted' | 'updated' | 'unchanged';
};

async function savePayload(db: Db, tenantId: string, bookingId: string, reference: string, booking: CavuBooking) {
  const { error } = await db.from('booking_external_payloads').upsert(
    {
      tenant_id: tenantId,
      booking_id: bookingId,
      source: CAVU_BOOKING_SOURCE,
      reference,
      payload: booking as any,
      fetched_at: new Date().toISOString(),
    } as any,
    { onConflict: CAVU_BOOKING_CONFLICT_TARGET, ignoreDuplicates: false } as any
  );
  if (error) {
    // Don't fail the sync if the payload copy fails.
    console.warn('[CAVU] Failed to save payload', formatCavuDbError('booking_external_payloads', reference, error));
  }
}

/**
 * Write one CAVU booking.
 * mode 'sync': insert if new; otherwise update CAVU-owned details, never downgrade a checked-in /
 *   checked-out car, never blank money when AmountPaid is absent, never touch gate/ops/anpr status.
 * mode 'heal': existing row only; fill blank fields, nothing else.
 * Throws CavuWriteError on DB failure and RangeError on an impossible date.
 */
export async function writeCavuBooking(
  db: Db,
  params: { tenantId: string; booking: CavuBooking; timezone: string; mode: 'sync' | 'heal'; reference?: string }
): Promise<CavuWriteResult> {
  const { tenantId, booking, timezone, mode } = params;
  const mapped = mapCavuBooking(booking, { tenantId, timezone, reference: params.reference });
  const reference = mapped.row.reference;
  if (!reference) throw new CavuWriteError('CAVU booking has no Reference');

  const { data: existingRow, error: readError } = await db
    .from('bookings')
    .select(EXISTING_BOOKING_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('source', CAVU_BOOKING_SOURCE)
    .eq('reference', reference)
    .maybeSingle();
  if (readError) {
    throw new CavuWriteError(`Read failed: ${formatCavuDbError('bookings', reference, readError)}`, readError.code);
  }
  const existing = existingRow as ExistingBooking | null;

  if (!existing) {
    if (mode === 'heal') return { bookingId: null, action: 'unchanged' };
    const { data, error } = await db
      .from('bookings')
      .upsert(mapped.row as any, { onConflict: CAVU_BOOKING_CONFLICT_TARGET, ignoreDuplicates: false } as any)
      .select('id')
      .single();
    if (error) {
      throw new CavuWriteError(`Upsert failed: ${formatCavuDbError('bookings', reference, error)}`, error.code);
    }
    if (data?.id) await savePayload(db, tenantId, data.id, reference, booking);
    return { bookingId: data?.id ?? null, action: 'inserted' };
  }

  const patch = mode === 'heal' ? buildHealPatch(mapped, existing) : buildSyncPatch(mapped, existing);
  if (!patch) {
    // Nothing to add. Still refresh the stored payload: its fetched_at is what stops the heal step
    // re-fetching this booking every run.
    await savePayload(db, tenantId, existing.id, reference, booking);
    return { bookingId: existing.id, action: 'unchanged' };
  }

  // Guarded status change: only applies if the status is still what we read, so a gate check-in
  // landing between our read and write is never overwritten.
  let query = db.from('bookings').update(patch as any).eq('id', existing.id);
  if ('status' in patch) {
    query = existing.status == null ? query.is('status', null) : query.eq('status', existing.status);
  }
  const { data: updated, error } = await query.select('id');
  if (error) {
    throw new CavuWriteError(`Update failed: ${formatCavuDbError('bookings', reference, error)}`, error.code);
  }
  if ('status' in patch && (!updated || updated.length === 0)) {
    const { status: _skip, ...rest } = patch;
    const { error: retryError } = await db.from('bookings').update(rest as any).eq('id', existing.id);
    if (retryError) {
      throw new CavuWriteError(`Update failed: ${formatCavuDbError('bookings', reference, retryError)}`, retryError.code);
    }
  }
  await savePayload(db, tenantId, existing.id, reference, booking);
  return { bookingId: existing.id, action: 'updated' };
}

/** CAVU CANCEL event: set status cancelled. Gate/ops/anpr status are left as they are. */
export async function cancelCavuBooking(db: Db, tenantId: string, reference: string): Promise<void> {
  const { error } = await db
    .from('bookings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('source', CAVU_BOOKING_SOURCE)
    .eq('reference', reference)
    .neq('status', 'cancelled');
  if (error) {
    throw new CavuWriteError(`Failed to cancel booking ${reference}: ${error.message}`, error.code);
  }
}
