/**
 * Authoritative operational-state resolver for Today Overview.
 *
 * Source of truth = the same lifecycle mutated by POST /api/admin/bookings/ops-status:
 *   Arrived / Arrived+Key → gate_status arrived|arrived_key_taken (+ arrived_at)
 *   Departed               → gate_status departed (+ departed_at)
 *   No-show                → gate_status no_show
 *   Cancelled              → status/gate_status cancelled
 *
 * Precedence for "currently parked" (arrived AND not departed):
 *   1. Exclude cancelled / no-show
 *   2. gate_status === departed → not parked
 *   3. gate_status in (arrived, arrived_key_taken) → parked
 *   4. Legacy: arrived_at set and departed_at null → parked
 *   5. Legacy: checked_in_at set, checked_out_at null, status checked_in → parked
 *   6. Otherwise not parked
 */

import { GATE_STATUS } from '@/lib/gateStatus';

export type OpsBookingState = {
  status?: string | null;
  gate_status?: string | null;
  arrived_at?: string | null;
  departed_at?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
};

export function isCancelledBooking(b: OpsBookingState): boolean {
  return b.status === 'cancelled' || b.gate_status === GATE_STATUS.CANCELLED;
}

export function isNoShowBooking(b: OpsBookingState): boolean {
  return b.gate_status === GATE_STATUS.NO_SHOW;
}

export function isArrivedOnSite(b: OpsBookingState): boolean {
  const gate = b.gate_status;
  return gate === GATE_STATUS.ARRIVED || gate === GATE_STATUS.ARRIVED_KEY_TAKEN;
}

export function isDepartedBooking(b: OpsBookingState): boolean {
  return b.gate_status === GATE_STATUS.DEPARTED;
}

/** Vehicle has actually arrived and has not actually departed. */
export function isCurrentlyParked(b: OpsBookingState): boolean {
  if (isCancelledBooking(b) || isNoShowBooking(b)) return false;
  if (isDepartedBooking(b)) return false;
  if (isArrivedOnSite(b)) return true;

  // Legacy / ANPR paths that set timestamps without modern gate_status.
  if (b.arrived_at && !b.departed_at) return true;
  if (
    b.checked_in_at &&
    !b.checked_out_at &&
    b.status === 'checked_in' &&
    b.gate_status !== GATE_STATUS.RESERVED &&
    b.gate_status !== GATE_STATUS.TAKE_KEY
  ) {
    return true;
  }
  return false;
}

/** Still expecting this vehicle to arrive (not cancelled/no-show/arrived/departed). */
export function isArrivalRemaining(b: OpsBookingState): boolean {
  if (isCancelledBooking(b) || isNoShowBooking(b)) return false;
  if (isArrivedOnSite(b) || isDepartedBooking(b)) return false;
  if (b.arrived_at && !b.departed_at) return false;
  return true;
}

/** Still expecting this vehicle to depart (not cancelled/no-show/departed). */
export function isDepartureRemaining(b: OpsBookingState): boolean {
  if (isCancelledBooking(b) || isNoShowBooking(b)) return false;
  if (isDepartedBooking(b) || Boolean(b.departed_at)) return false;
  return true;
}

export function isKeysToTakeRemaining(b: OpsBookingState): boolean {
  return !isCancelledBooking(b) && b.gate_status === GATE_STATUS.TAKE_KEY;
}

/** Flight shown on departures board: return flight, then outbound, else —. */
export function departureFlightDisplay(b: {
  return_flight_number?: string | null;
  flight_number?: string | null;
}): string {
  const value = (b.return_flight_number || b.flight_number || '').trim();
  return value || '—';
}
