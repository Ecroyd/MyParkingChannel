// src/lib/suppliers/cavuBookingMapper.ts
//
// Pure mapping from a CAVU booking (GetBookingDetails) to our bookings row, plus the merge rules
// every CAVU write path uses for a booking that already exists. No I/O here so it is unit-testable;
// the DB read/write lives in cavuBookingWrite.ts.
import type { CavuBooking } from './cavu';
import { DEFAULT_TENANT_TIMEZONE, parseSupplierDateTimeToUtc } from '@/lib/datetime/parse';
import { parseMoney } from '@/lib/parseMoney';

export const CAVU_SUPPLIER_CODE = 'cavu';
export const CAVU_BOOKING_SOURCE = 'cavu';
export const CAVU_BOOKING_CONFLICT_TARGET = 'tenant_id,source,reference';

export type BookingStatus = 'reserved' | 'checked_in' | 'checked_out' | 'cancelled';

/** Statuses set by the gate / ops team. CAVU never moves a booking out of these except to cancel it. */
const OPERATIONAL_STATUSES: ReadonlySet<string> = new Set(['checked_in', 'checked_out']);

/**
 * Map a CAVU booking Status to ours. Exact matches only (the old `includes('IN')` version turned
 * e.g. "PENDING" into checked_in). Returns null for an unknown/missing status.
 */
export function mapCavuStatus(status?: string | null): BookingStatus | null {
  switch (String(status ?? '').trim().toUpperCase()) {
    case 'CONFIRMED':
    case 'AMEND':
    case 'AMENDED':
    case 'NEW':
      return 'reserved';
    case 'COMPLETED':
      return 'checked_out';
    case 'CANCELLED':
    case 'CANCELED':
    case 'CANCEL':
    case 'NOSHOW':
    case 'NO_SHOW':
      return 'cancelled';
    default:
      return null;
  }
}

export type CavuBookingRow = {
  tenant_id: string;
  reference: string;
  external_source: string;
  start_at: string | null;
  end_at: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  plate: string;
  car_make: string | null;
  car_model: string | null;
  car_color: string | null;
  flight_number: string | null;
  return_flight_number: string | null;
  returning_from: string | null;
  outbound_terminal: string | null;
  return_terminal: string | null;
  flight_date: string | null;
  source: string;
  status: BookingStatus;
  money_received: number;
  money_charged: number;
  notes: string | null;
  is_incomplete: boolean;
  missing_fields: string[];
  updated_at: string;
};

export type MappedCavuBooking = {
  /** Full row for a brand-new booking (same shape the events sync always inserted). */
  row: CavuBookingRow;
  /** CAVU's status mapped exactly; null when CAVU sent nothing we recognise. */
  cavuStatus: BookingStatus | null;
  /** AmountPaid parsed to pounds; null when CAVU omitted it (never treat as £0 on an update). */
  amountPaid: number | null;
};

function blank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function toUtc(raw: string | null | undefined, timezone: string): string | null {
  if (blank(raw)) return null;
  // CAVU sends car-park LOCAL times with a bogus "Z"; parseSupplierDateTimeToUtc strips it and
  // converts from the tenant timezone. An unreadable/impossible date (e.g. month 13) throws
  // RangeError rather than storing the raw string (which Postgres would read as UTC); callers
  // treat that as a permanently bad event.
  const utc = parseSupplierDateTimeToUtc(raw, timezone);
  if (!utc || !Number.isFinite(Date.parse(utc))) {
    throw new RangeError(`Invalid CAVU date/time: ${String(raw).slice(0, 40)}`);
  }
  return utc;
}

/** Which required fields are missing on a (possibly merged) booking row. */
export function computeMissingFields(r: {
  customer_name?: string | null;
  plate?: string | null;
  customer_email?: string | null;
  start_at?: string | null;
  end_at?: string | null;
}): string[] {
  const missing: string[] = [];
  if (blank(r.customer_name) || r.customer_name === 'Unknown') missing.push('customer_name');
  if (blank(r.plate) || r.plate === 'UNKNOWN') missing.push('plate');
  if (blank(r.customer_email)) missing.push('customer_email');
  if (blank(r.start_at)) missing.push('start_at');
  if (blank(r.end_at)) missing.push('end_at');
  return missing;
}

export function mapCavuBooking(
  booking: CavuBooking,
  opts: { tenantId: string; timezone?: string | null; now?: Date; reference?: string }
): MappedCavuBooking {
  const timezone = opts.timezone || DEFAULT_TENANT_TIMEZONE;

  const customerName =
    `${booking.Customer?.FirstName ?? ''} ${booking.Customer?.Surname ?? ''}`.trim() || 'Unknown';
  const plate = (booking.Vehicle?.Registration ?? '').replace(/\s+/g, '').toUpperCase() || 'UNKNOWN';

  const cavuStatus = mapCavuStatus(booking.Status);
  const amountPaid = parseMoney(booking.AmountPaid);

  const start_at = toUtc(booking.ArrivalDate, timezone);
  const end_at = toUtc(booking.DepartureDate, timezone);

  // flight_date is the local calendar date of arrival, as CAVU wrote it.
  const flightDate = booking.ArrivalDate ? booking.ArrivalDate.slice(0, 10) : null;

  const missingFields = computeMissingFields({
    customer_name: customerName,
    plate,
    customer_email: booking.Customer?.Email ?? null,
    start_at: booking.ArrivalDate,
    end_at: booking.DepartureDate,
  });

  const row: CavuBookingRow = {
    tenant_id: opts.tenantId,
    reference: booking.Reference ?? opts.reference,
    external_source: CAVU_SUPPLIER_CODE,
    start_at,
    end_at,
    customer_name: customerName,
    customer_email: booking.Customer?.Email ?? null,
    customer_phone: booking.Customer?.Mobile ?? null,
    plate,
    car_make: booking.Vehicle?.Make ?? null,
    car_model: booking.Vehicle?.Model ?? null,
    car_color: booking.Vehicle?.Colour ?? null,
    flight_number: booking.OutboundFlight ?? null,
    return_flight_number: booking.ReturnFlight ?? null,
    returning_from: booking.ReturningFrom ?? null,
    outbound_terminal: booking.OutboundTerminal ?? null,
    return_terminal: booking.ReturnTerminal ?? null,
    flight_date: flightDate,
    source: CAVU_BOOKING_SOURCE,
    status: cavuStatus ?? 'reserved',
    money_received: amountPaid ?? 0,
    money_charged: amountPaid ?? 0,
    notes: booking.SpecialRequests ?? null,
    is_incomplete: missingFields.length > 0,
    missing_fields: missingFields,
    updated_at: (opts.now ?? new Date()).toISOString(),
  };

  return { row, cavuStatus, amountPaid };
}

/** Columns read from an existing booking before merging. */
export const EXISTING_BOOKING_COLUMNS =
  'id, status, money_charged, money_received, start_at, end_at, customer_name, customer_email, ' +
  'customer_phone, plate, car_make, car_model, car_color, flight_number, return_flight_number, ' +
  'returning_from, outbound_terminal, return_terminal, flight_date, notes';

export type ExistingBooking = {
  id: string;
  status: string | null;
  money_charged?: number | string | null;
  money_received?: number | string | null;
} & Partial<Record<(typeof DETAIL_FIELDS)[number], string | null>>;

/** Descriptive fields CAVU owns (never operational state, status or money). */
const DETAIL_FIELDS = [
  'start_at',
  'end_at',
  'customer_name',
  'customer_email',
  'customer_phone',
  'plate',
  'car_make',
  'car_model',
  'car_color',
  'flight_number',
  'return_flight_number',
  'returning_from',
  'outbound_terminal',
  'return_terminal',
  'flight_date',
  'notes',
] as const;

const PLACEHOLDERS: Record<string, string> = { customer_name: 'Unknown', plate: 'UNKNOWN' };

function isBlankField(field: string, v: unknown): boolean {
  return blank(v) || (PLACEHOLDERS[field] !== undefined && v === PLACEHOLDERS[field]);
}

/**
 * Status to write for an existing booking, or undefined to leave it alone.
 * - CAVU cancelled → cancelled (always wins).
 * - A car that is checked_in / checked_out keeps that status: CAVU knows nothing about the gate.
 * - Unknown CAVU status → leave alone.
 */
export function resolveStatusForExisting(
  existingStatus: string | null | undefined,
  cavuStatus: BookingStatus | null
): BookingStatus | undefined {
  if (!cavuStatus) return undefined;
  if (cavuStatus === 'cancelled') return existingStatus === 'cancelled' ? undefined : 'cancelled';
  if (existingStatus && OPERATIONAL_STATUSES.has(existingStatus)) return undefined;
  return existingStatus === cavuStatus ? undefined : cavuStatus;
}

export type BookingPatch = Record<string, unknown>;

/** Postgres returns timestamptz as "...+00:00"; compare instants, not strings. */
function sameValue(field: string, a: unknown, b: unknown): boolean {
  if ((field === 'start_at' || field === 'end_at') && typeof a === 'string' && typeof b === 'string') {
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb;
  }
  return a === b;
}

/**
 * Update for an existing booking from a normal sync (events / arrivals / manual):
 * CAVU's details win, but a blank/placeholder never wipes a value we already have; status follows
 * resolveStatusForExisting; money only when CAVU actually sent AmountPaid. gate_status / ops_status /
 * anpr_status are never part of the patch.
 */
export function buildSyncPatch(mapped: MappedCavuBooking, existing: ExistingBooking): BookingPatch {
  const patch: BookingPatch = {};
  const merged: Record<string, unknown> = { ...existing };
  for (const f of DETAIL_FIELDS) {
    const next = mapped.row[f];
    if (isBlankField(f, next) && !isBlankField(f, existing[f])) continue;
    if (!sameValue(f, next, existing[f])) patch[f] = next;
    merged[f] = next;
  }
  const status = resolveStatusForExisting(existing.status, mapped.cavuStatus);
  if (status) patch.status = status;
  if (mapped.amountPaid !== null) {
    patch.money_charged = mapped.amountPaid;
    patch.money_received = mapped.amountPaid;
  }
  const missing = computeMissingFields(merged);
  patch.external_source = CAVU_SUPPLIER_CODE;
  patch.is_incomplete = missing.length > 0;
  patch.missing_fields = missing;
  patch.updated_at = mapped.row.updated_at;
  return patch;
}

/**
 * Heal patch: only fill fields that are blank on the existing row. Never touches times that are
 * set, status or money. Returns null when CAVU has nothing to add (caller skips the write).
 */
export function buildHealPatch(mapped: MappedCavuBooking, existing: ExistingBooking): BookingPatch | null {
  const patch: BookingPatch = {};
  const merged: Record<string, unknown> = { ...existing };
  for (const f of DETAIL_FIELDS) {
    const next = mapped.row[f];
    if (isBlankField(f, existing[f]) && !isBlankField(f, next)) {
      patch[f] = next;
      merged[f] = next;
    }
  }
  if (Object.keys(patch).length === 0) return null;
  const missing = computeMissingFields(merged);
  patch.is_incomplete = missing.length > 0;
  patch.missing_fields = missing;
  patch.updated_at = mapped.row.updated_at;
  return patch;
}
