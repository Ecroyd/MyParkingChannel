import { describe, expect, it } from 'vitest';
import {
  actualOccupancyAt,
  actualOccupancyFromLedgerAt,
  actualOccupiesSlot,
  aggregateOccupancyTimeseries,
  applyOccupancyEventPure,
  bookingIsIncludedInExpectedOccupancy,
  expectedOccupiesSlot,
  generateOccupancySlots,
  isAuthoritativeOnSite,
  occupancyWindowFromDateKeys,
  resolveCurrentOccupancyPure,
  OCCUPANCY_INTERVAL_MINUTES,
  type OccupancyBookingRow,
  type OccupancyEventRow,
  type OccupancySnapshotRow,
} from '../occupancyTimeseries';

function booking(
  partial: Partial<OccupancyBookingRow> & Pick<OccupancyBookingRow, 'start_at' | 'end_at'>
): OccupancyBookingRow {
  return {
    id: partial.id ?? 'b1',
    reference: partial.reference ?? 'REF1',
    status: partial.status ?? 'reserved',
    gate_status: partial.gate_status ?? 'reserved',
    ops_status: partial.ops_status ?? null,
    anpr_status: partial.anpr_status ?? null,
    ops_hidden: partial.ops_hidden ?? false,
    ops_hidden_reason: partial.ops_hidden_reason ?? null,
    external_status: partial.external_status ?? null,
    arrived_at: partial.arrived_at ?? null,
    departed_at: partial.departed_at ?? null,
    checked_in_at: partial.checked_in_at ?? null,
    checked_out_at: partial.checked_out_at ?? null,
    start_at: partial.start_at,
    end_at: partial.end_at,
  };
}

describe('occupancy booking-state actual', () => {
  const now = new Date('2026-07-16T18:00:00.000Z');

  it('uses 30-minute intervals and one day has exactly 48 points', () => {
    expect(OCCUPANCY_INTERVAL_MINUTES).toBe(30);
    const { from, to } = occupancyWindowFromDateKeys('2026-07-16', '2026-07-16');
    const slots = generateOccupancySlots(from, to);
    expect(slots).toHaveLength(48);
    expect(slots[0]).toBe('2026-07-16T00:00:00.000Z');
    expect(slots[slots.length - 1]).toBe('2026-07-16T23:30:00.000Z');
  });

  it('Actual follows parked presence without requiring a baseline', () => {
    const parked = booking({
      id: 'p1',
      start_at: '2026-07-16T08:00:00.000Z',
      end_at: '2026-07-16T20:00:00.000Z',
      status: 'checked_in',
      gate_status: 'arrived',
      anpr_status: 'on_site',
      arrived_at: '2026-07-16T10:00:00.000Z',
    });
    const result = aggregateOccupancyTimeseries({
      bookings: [parked],
      snapshots: [],
      events: [],
      from: '2026-07-16T00:00:00.000Z',
      to: '2026-07-17T00:00:00.000Z',
      reliableFrom: null,
      now,
    });
    const before = result.points.find((p) => p.timestamp === '2026-07-16T09:30:00.000Z');
    const after = result.points.find((p) => p.timestamp === '2026-07-16T10:00:00.000Z');
    const future = result.points.find((p) => p.timestamp === '2026-07-16T20:00:00.000Z');
    expect(before?.actual).toBe(0);
    expect(after?.actual).toBe(1);
    expect(future?.actual).toBeNull();
    expect(result.actualUnavailableBeforeBaseline).toBe(false);
  });

  it('departed stays occupy only [arrival, departure)', () => {
    const stayed = booking({
      id: 'd1',
      start_at: '2026-07-16T08:00:00.000Z',
      end_at: '2026-07-16T18:00:00.000Z',
      status: 'checked_out',
      gate_status: 'departed',
      anpr_status: 'departed',
      ops_hidden: true,
      ops_hidden_reason: 'departed',
      arrived_at: '2026-07-16T09:00:00.000Z',
      departed_at: '2026-07-16T14:00:00.000Z',
    });
    expect(actualOccupiesSlot(stayed, '2026-07-16T09:00:00.000Z', now.getTime())).toBe(true);
    expect(actualOccupiesSlot(stayed, '2026-07-16T13:30:00.000Z', now.getTime())).toBe(true);
    expect(actualOccupiesSlot(stayed, '2026-07-16T14:00:00.000Z', now.getTime())).toBe(false);
    expect(isAuthoritativeOnSite(stayed)).toBe(false);
  });

  it('Today Currently Parked and Actual now use the same count', () => {
    const open = booking({
      id: 'o1',
      start_at: '2026-07-16T08:00:00.000Z',
      end_at: '2026-07-16T20:00:00.000Z',
      status: 'checked_in',
      gate_status: 'arrived_key_taken',
      anpr_status: 'on_site',
      arrived_at: '2026-07-16T09:00:00.000Z',
    });
    const gone = booking({
      id: 'g1',
      start_at: '2026-07-15T08:00:00.000Z',
      end_at: '2026-07-16T12:00:00.000Z',
      status: 'checked_out',
      gate_status: 'departed',
      arrived_at: '2026-07-15T09:00:00.000Z',
      departed_at: '2026-07-16T11:00:00.000Z',
      ops_hidden: true,
      ops_hidden_reason: 'departed',
    });
    const takeKey = booking({
      id: 'k1',
      start_at: '2026-07-17T08:00:00.000Z',
      end_at: '2026-07-17T18:00:00.000Z',
      gate_status: 'take_key',
      status: 'reserved',
    });

    const current = resolveCurrentOccupancyPure({
      bookings: [open, gone, takeKey],
      snapshots: [],
      events: [],
      reliableFrom: null,
      now,
    });
    const chartNow = actualOccupancyAt({
      slotIso: '2026-07-16T17:30:00.000Z',
      nowMs: now.getTime(),
      bookings: [open, gone, takeKey],
    });
    expect(current.occupiedCount).toBe(1);
    expect(chartNow.count).toBe(1);
    expect(current.mode).toBe('fallback_booking_state');
  });

  it('take_key without arrival does not count as authoritative on-site', () => {
    expect(
      isAuthoritativeOnSite(
        booking({
          start_at: '2026-07-17T08:00:00.000Z',
          end_at: '2026-07-17T18:00:00.000Z',
          gate_status: 'take_key',
          anpr_status: 'not_arrived',
          status: 'reserved',
        })
      )
    ).toBe(false);
  });

  it('arrived_key_taken with open arrival counts; departed timestamp overrides stale on-site', () => {
    expect(
      isAuthoritativeOnSite(
        booking({
          start_at: '2026-07-02T08:00:00.000Z',
          end_at: '2026-07-16T18:00:00.000Z',
          gate_status: 'arrived_key_taken',
          status: 'checked_in',
          anpr_status: 'on_site',
          arrived_at: '2026-07-02T09:46:00.000Z',
        })
      )
    ).toBe(true);
    expect(
      isAuthoritativeOnSite(
        booking({
          start_at: '2026-07-02T08:00:00.000Z',
          end_at: '2026-07-16T18:00:00.000Z',
          gate_status: 'arrived_key_taken',
          status: 'checked_in',
          anpr_status: 'on_site',
          arrived_at: '2026-07-02T09:46:00.000Z',
          departed_at: '2026-07-16T13:27:00.000Z',
        })
      )
    ).toBe(false);
  });

  it('cancelled/CANX open arrivals do not count', () => {
    expect(
      isAuthoritativeOnSite(
        booking({
          start_at: '2026-07-16T08:00:00.000Z',
          end_at: '2026-07-16T18:00:00.000Z',
          gate_status: 'arrived',
          status: 'cancelled',
          arrived_at: '2026-07-16T08:00:00.000Z',
        })
      )
    ).toBe(false);
    expect(
      isAuthoritativeOnSite(
        booking({
          start_at: '2026-07-16T08:00:00.000Z',
          end_at: '2026-07-16T18:00:00.000Z',
          gate_status: 'arrived',
          status: 'checked_in',
          external_status: 'CANX',
          arrived_at: '2026-07-16T08:00:00.000Z',
        })
      )
    ).toBe(false);
  });

  it('expected excludes cancelled, no-show, ops_hidden; departed still counts', () => {
    expect(
      bookingIsIncludedInExpectedOccupancy(
        booking({
          start_at: '2026-07-16T08:00:00.000Z',
          end_at: '2026-07-16T10:00:00.000Z',
          status: 'cancelled',
        })
      )
    ).toBe(false);
    expect(
      bookingIsIncludedInExpectedOccupancy(
        booking({
          start_at: '2026-07-16T08:00:00.000Z',
          end_at: '2026-07-16T10:00:00.000Z',
          gate_status: 'no_show',
        })
      )
    ).toBe(false);
    expect(
      bookingIsIncludedInExpectedOccupancy(
        booking({
          start_at: '2026-07-16T08:00:00.000Z',
          end_at: '2026-07-16T10:00:00.000Z',
          ops_hidden: true,
          ops_hidden_reason: 'bulk_delete',
        })
      )
    ).toBe(false);
    const departed = booking({
      start_at: '2026-07-16T08:00:00.000Z',
      end_at: '2026-07-16T10:00:00.000Z',
      gate_status: 'departed',
      ops_hidden: true,
      ops_hidden_reason: 'departed',
    });
    expect(bookingIsIncludedInExpectedOccupancy(departed)).toBe(true);
    expect(expectedOccupiesSlot(departed, '2026-07-16T09:00:00.000Z')).toBe(true);
  });

  it('Europe/London labels remain correct across BST', () => {
    const bstSlot = '2026-07-16T07:00:00.000Z';
    const label = new Date(bstSlot).toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    expect(label).toMatch(/08:00/);
  });
});

describe('occupancy event ledger helpers (optional tooling)', () => {
  const reliableFrom = '2026-07-16T12:00:00.000Z';
  const snapshot: OccupancySnapshotRow = {
    tenant_id: 't1',
    snapshot_at: reliableFrom,
    occupied_count: 100,
    source: 'admin_confirmed',
    data_quality: 'clean',
  };
  const now = new Date('2026-07-16T18:00:00.000Z');

  it('baseline plus arrival increases count; departure decreases', () => {
    const events: OccupancyEventRow[] = [
      {
        id: 'e1',
        tenant_id: 't1',
        booking_id: 'b1',
        event_at: '2026-07-16T13:00:00.000Z',
        event_kind: 'arrival',
        delta: 1,
      },
      {
        id: 'e2',
        tenant_id: 't1',
        booking_id: 'b2',
        event_at: '2026-07-16T14:00:00.000Z',
        event_kind: 'departure',
        delta: -1,
      },
    ];
    expect(
      actualOccupancyFromLedgerAt({
        slotIso: '2026-07-16T13:30:00.000Z',
        nowMs: now.getTime(),
        reliableFrom,
        snapshots: [snapshot],
        events,
      }).count
    ).toBe(101);
    expect(
      actualOccupancyFromLedgerAt({
        slotIso: '2026-07-16T14:30:00.000Z',
        nowMs: now.getTime(),
        reliableFrom,
        snapshots: [snapshot],
        events,
      }).count
    ).toBe(100);
  });

  it('duplicate arrival while on-site is ignored', () => {
    let state = {
      onSiteBookingIds: new Set<string>(),
      events: [] as OccupancyEventRow[],
      occupied: 100,
    };
    const first = applyOccupancyEventPure(state, {
      tenant_id: 't1',
      booking_id: 'b1',
      event_at: '2026-07-16T13:00:00.000Z',
      event_kind: 'arrival',
      delta: 1,
    });
    expect(first.applied).toBe(true);
    state = first.state;
    const dup = applyOccupancyEventPure(state, {
      tenant_id: 't1',
      booking_id: 'b1',
      event_at: '2026-07-16T13:05:00.000Z',
      event_kind: 'arrival',
      delta: 1,
    });
    expect(dup.applied).toBe(false);
    expect(dup.state.occupied).toBe(101);
  });

  it('points before reliable_from return ledger actual null', () => {
    expect(
      actualOccupancyFromLedgerAt({
        slotIso: '2026-07-16T09:00:00.000Z',
        nowMs: now.getTime(),
        reliableFrom,
        snapshots: [snapshot],
        events: [],
      }).count
    ).toBeNull();
    expect(
      actualOccupancyFromLedgerAt({
        slotIso: '2026-07-16T12:00:00.000Z',
        nowMs: now.getTime(),
        reliableFrom,
        snapshots: [snapshot],
        events: [],
      }).count
    ).toBe(100);
  });

  it('impossible negative count produces data-quality error flag', () => {
    const events: OccupancyEventRow[] = [
      {
        id: 'e1',
        tenant_id: 't1',
        booking_id: 'b1',
        event_at: '2026-07-16T13:00:00.000Z',
        event_kind: 'departure',
        delta: -1,
      },
    ];
    const snapZero: OccupancySnapshotRow = { ...snapshot, occupied_count: 0 };
    const result = actualOccupancyFromLedgerAt({
      slotIso: '2026-07-16T14:00:00.000Z',
      nowMs: now.getTime(),
      reliableFrom,
      snapshots: [snapZero],
      events,
    });
    expect(result.count).toBe(0);
    expect(result.negative).toBe(true);
  });
});
