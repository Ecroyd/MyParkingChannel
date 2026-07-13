import { describe, expect, it } from 'vitest';
import { GATE_STATUS } from '@/lib/gateStatus';
import {
  departureFlightDisplay,
  isArrivalRemaining,
  isCurrentlyParked,
  isDepartureRemaining,
} from '@/lib/ops/parkedState';

describe('parkedState', () => {
  it('treats arrived gate_status as parked and not an arrival remaining', () => {
    const b = { status: 'checked_in', gate_status: GATE_STATUS.ARRIVED, arrived_at: '2026-07-13T10:00:00Z' };
    expect(isCurrentlyParked(b)).toBe(true);
    expect(isArrivalRemaining(b)).toBe(false);
    expect(isDepartureRemaining(b)).toBe(true);
  });

  it('treats departed as not parked and not departure remaining', () => {
    const b = {
      status: 'checked_out',
      gate_status: GATE_STATUS.DEPARTED,
      arrived_at: '2026-07-13T10:00:00Z',
      departed_at: '2026-07-13T18:00:00Z',
    };
    expect(isCurrentlyParked(b)).toBe(false);
    expect(isArrivalRemaining(b)).toBe(false);
    expect(isDepartureRemaining(b)).toBe(false);
  });

  it('excludes cancelled and no-show from parked and remaining', () => {
    expect(
      isCurrentlyParked({ status: 'cancelled', gate_status: GATE_STATUS.CANCELLED })
    ).toBe(false);
    expect(isArrivalRemaining({ status: 'reserved', gate_status: GATE_STATUS.NO_SHOW })).toBe(false);
    expect(isCurrentlyParked({ status: 'reserved', gate_status: GATE_STATUS.NO_SHOW })).toBe(false);
  });

  it('does not count reserved schedule-only bookings as parked', () => {
    const b = { status: 'reserved', gate_status: GATE_STATUS.RESERVED };
    expect(isCurrentlyParked(b)).toBe(false);
    expect(isArrivalRemaining(b)).toBe(true);
  });

  it('falls back to arrived_at without departed_at for legacy rows', () => {
    const b = { status: 'checked_in', gate_status: null, arrived_at: '2026-07-13T09:00:00Z' };
    expect(isCurrentlyParked(b)).toBe(true);
  });

  it('prefers return_flight_number for departures display', () => {
    expect(departureFlightDisplay({ return_flight_number: 'BA123', flight_number: 'BA999' })).toBe('BA123');
    expect(departureFlightDisplay({ return_flight_number: null, flight_number: 'BA999' })).toBe('BA999');
    expect(departureFlightDisplay({})).toBe('—');
  });
});
