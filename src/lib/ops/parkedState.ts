/**
 * Authoritative operational-state resolver for Today Overview.
 *
 * Physical "currently parked" aligns with isAuthoritativeOnSite in occupancyTimeseries:
 *   effective_arrival = coalesce(arrived_at, checked_in_at)
 *   effective_departure = coalesce(departed_at, checked_out_at)
 *   require arrival, no departure, not hidden/cancelled/no-show/CANX,
 *   and physical on-site state (arrived / arrived_key_taken / anpr on_site / checked_in).
 *   take_key never means physically parked.
 */

import { GATE_STATUS } from '@/lib/gateStatus';
import { isCancelledSupplierStatus } from '@/lib/ingest/importStatusMapping';

export type OpsBookingState = {
  status?: string | null;
  gate_status?: string | null;
  ops_status?: string | null;
  anpr_status?: string | null;
  ops_hidden?: boolean | null;
  ops_hidden_reason?: string | null;
  ops_hidden_at?: string | null;
  ops_hidden_by?: string | null;
  external_status?: string | null;
  arrived_at?: string | null;
  departed_at?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
};

function lower(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

export function isCancelledBooking(b: OpsBookingState): boolean {
  if (lower(b.status) === 'cancelled' || lower(b.status) === 'canceled') return true;
  if (lower(b.gate_status) === GATE_STATUS.CANCELLED || lower(b.gate_status) === 'canceled') return true;
  if (lower(b.ops_status) === 'cancelled' || lower(b.ops_status) === 'canceled') return true;
  if (isCancelledSupplierStatus(b.external_status)) return true;
  return false;
}

export function isNoShowBooking(b: OpsBookingState): boolean {
  const gate = lower(b.gate_status);
  const ops = lower(b.ops_status);
  return gate === GATE_STATUS.NO_SHOW || gate === 'no-show' || ops === 'no_show' || ops === 'no-show';
}

export function isArrivedOnSite(b: OpsBookingState): boolean {
  const gate = b.gate_status;
  return gate === GATE_STATUS.ARRIVED || gate === GATE_STATUS.ARRIVED_KEY_TAKEN;
}

export function isDepartedBooking(b: OpsBookingState): boolean {
  return b.gate_status === GATE_STATUS.DEPARTED;
}

export function effectiveArrivalAt(b: OpsBookingState): string | null {
  return b.arrived_at || b.checked_in_at || null;
}

export function effectiveDepartureAt(b: OpsBookingState): string | null {
  return b.departed_at || b.checked_out_at || null;
}

function indicatesPhysicalOnSiteState(b: OpsBookingState): boolean {
  const gate = lower(b.gate_status);
  if (gate === GATE_STATUS.TAKE_KEY) return false;
  if (gate === GATE_STATUS.ARRIVED || gate === GATE_STATUS.ARRIVED_KEY_TAKEN) return true;
  if (lower(b.anpr_status) === 'on_site') return true;
  if (lower(b.status) === 'checked_in') return true;
  return false;
}

/**
 * Vehicle is physically on site for occupancy KPIs.
 * take_key without arrival does not count. A departure timestamp overrides stale on-site state.
 */
export function isCurrentlyParked(b: OpsBookingState): boolean {
  if (isCancelledBooking(b) || isNoShowBooking(b)) return false;
  if (b.ops_hidden) return false;
  if (lower(b.gate_status) === GATE_STATUS.TAKE_KEY) return false;
  if (isDepartedBooking(b)) return false;
  if (!effectiveArrivalAt(b)) return false;
  if (effectiveDepartureAt(b)) return false;
  return indicatesPhysicalOnSiteState(b);
}

/** Still expecting this vehicle to arrive (not cancelled/no-show/arrived/departed). */
export function isArrivalRemaining(b: OpsBookingState): boolean {
  if (isCancelledBooking(b) || isNoShowBooking(b)) return false;
  if (isArrivedOnSite(b) || isDepartedBooking(b)) return false;
  if (effectiveArrivalAt(b) && !effectiveDepartureAt(b)) return false;
  return true;
}

/** Still expecting this vehicle to depart (not cancelled/no-show/departed). */
export function isDepartureRemaining(b: OpsBookingState): boolean {
  if (isCancelledBooking(b) || isNoShowBooking(b)) return false;
  if (isDepartedBooking(b) || Boolean(effectiveDepartureAt(b))) return false;
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
