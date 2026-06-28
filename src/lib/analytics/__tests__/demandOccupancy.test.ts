import { describe, expect, it } from 'vitest';
import {
  aggregateDemandByDay,
  bookingOverlapsTenantDay,
  countsForActualOccupancy,
  countsForBookedDemand,
  enumerateDateKeys,
} from '@/lib/analytics/demandOccupancy';
import type { DemandBookingRow } from '@/lib/analytics/demandOccupancy';
import { GATE_STATUS } from '@/lib/gateStatus';

const TZ = 'Europe/London';

function booking(partial: Partial<DemandBookingRow> & Pick<DemandBookingRow, 'start_at' | 'end_at'>): DemandBookingRow {
  return {
    reference: partial.reference ?? 'REF',
    status: partial.status ?? 'reserved',
    gate_status: partial.gate_status ?? GATE_STATUS.RESERVED,
    ops_hidden: partial.ops_hidden ?? false,
    source: partial.source ?? 'direct',
    ...partial,
  };
}

/** PF41125 — Jun 28 04:00 to Jul 2 22:00 London */
const PF41125 = booking({
  reference: 'PF41125',
  start_at: '2026-06-28T03:00:00.000Z',
  end_at: '2026-07-02T21:00:00.000Z',
  status: 'checked_out',
  gate_status: GATE_STATUS.DEPARTED,
  ops_hidden: true,
  source: 'direct',
});

describe('demandOccupancy', () => {
  it('counts departed booking with ops_hidden=true in bookedDemand', () => {
    expect(countsForBookedDemand(PF41125)).toBe(true);
    const days = aggregateDemandByDay({
      bookings: [PF41125],
      dayKeys: ['2026-06-28'],
      timezone: TZ,
    });
    expect(days[0]?.bookedDemand).toBe(1);
  });

  it('counts departed booking with ops_hidden=true in actualOccupancy', () => {
    expect(countsForActualOccupancy(PF41125)).toBe(true);
    const days = aggregateDemandByDay({
      bookings: [PF41125],
      dayKeys: ['2026-06-29'],
      timezone: TZ,
    });
    expect(days[0]?.actualOccupancy).toBe(1);
  });

  it('excludes cancelled bookings from bookedDemand', () => {
    const cancelled = booking({
      reference: 'CANCEL1',
      start_at: '2026-06-28T10:00:00.000Z',
      end_at: '2026-06-30T10:00:00.000Z',
      status: 'cancelled',
      gate_status: GATE_STATUS.CANCELLED,
      ops_hidden: true,
    });
    const days = aggregateDemandByDay({
      bookings: [cancelled, PF41125],
      dayKeys: ['2026-06-28'],
      timezone: TZ,
      includeDebug: true,
    });
    expect(days[0]?.bookedDemand).toBe(1);
    expect(days[0]?.excludedCancelledRefs).toContain('CANCEL1');
  });

  it('includes no_show in bookedDemand but not actualOccupancy', () => {
    const noShow = booking({
      reference: 'NS1',
      start_at: '2026-06-24T10:00:00.000Z',
      end_at: '2026-06-26T10:00:00.000Z',
      gate_status: GATE_STATUS.NO_SHOW,
      ops_hidden: false,
    });
    const days = aggregateDemandByDay({
      bookings: [noShow],
      dayKeys: ['2026-06-25'],
      timezone: TZ,
      includeDebug: true,
    });
    expect(days[0]?.bookedDemand).toBe(1);
    expect(days[0]?.actualOccupancy).toBe(0);
    expect(days[0]?.excludedNoShowRefs).toContain('NS1');
  });

  it('PF41125 overlaps Jun 28–Jul 2 tenant-local days', () => {
    const expectedDays = [
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ];
    for (const day of expectedDays) {
      expect(bookingOverlapsTenantDay(PF41125, day, TZ)).toBe(true);
    }
    expect(bookingOverlapsTenantDay(PF41125, '2026-06-27', TZ)).toBe(false);
    expect(bookingOverlapsTenantDay(PF41125, '2026-07-03', TZ)).toBe(false);

    const days = aggregateDemandByDay({
      bookings: [PF41125],
      dayKeys: [...expectedDays, '2026-06-27', '2026-07-03'],
      timezone: TZ,
    });
    for (const day of expectedDays) {
      expect(days.find((d) => d.date === day)?.bookedDemand).toBe(1);
    }
    expect(days.find((d) => d.date === '2026-06-27')?.bookedDemand).toBe(0);
    expect(days.find((d) => d.date === '2026-07-03')?.bookedDemand).toBe(0);
  });

  it('does not exclude ops_hidden when aggregating bookedDemand', () => {
    const hiddenDeparted = booking({
      reference: 'HID1',
      start_at: '2026-06-24T08:00:00.000Z',
      end_at: '2026-06-26T08:00:00.000Z',
      status: 'checked_out',
      gate_status: GATE_STATUS.DEPARTED,
      ops_hidden: true,
    });

    const buggyCount = [hiddenDeparted].filter(
      (b) => countsForBookedDemand(b) && !b.ops_hidden
    ).length;
    expect(buggyCount).toBe(0);

    const days = aggregateDemandByDay({
      bookings: [hiddenDeparted],
      dayKeys: ['2026-06-25'],
      timezone: TZ,
    });
    expect(days[0]?.bookedDemand).toBe(1);
  });

  it('matches Flyparks SQL snapshot booked demand totals', () => {
    /**
     * Confirmed SQL comparison for Flyparks tenant 2026-06-24..2026-07-10.
     * Synthetic fixture: each day N bookings with single-day stays produce count N.
     */
    const expected: Record<string, number> = {
      '2026-06-24': 167,
      '2026-06-25': 176,
      '2026-06-26': 158,
      '2026-06-27': 144,
      '2026-06-28': 146,
      '2026-06-29': 160,
      '2026-06-30': 150,
      '2026-07-01': 135,
      '2026-07-02': 132,
      '2026-07-03': 137,
      '2026-07-04': 131,
      '2026-07-05': 130,
      '2026-07-06': 137,
      '2026-07-07': 133,
      '2026-07-08': 130,
      '2026-07-09': 124,
      '2026-07-10': 121,
    };

    const dayKeys = enumerateDateKeys('2026-06-24', '2026-07-10');
    const fixture: DemandBookingRow[] = [];

    for (const [day, count] of Object.entries(expected)) {
      for (let i = 0; i < count; i++) {
        const start = `${day}T08:00:00.000Z`;
        const end = `${day}T18:00:00.000Z`;
        fixture.push(
          booking({
            reference: `${day}-${i}`,
            start_at: start,
            end_at: end,
            ops_hidden: i % 3 === 0,
            gate_status: i % 5 === 0 ? GATE_STATUS.DEPARTED : GATE_STATUS.RESERVED,
            status: i % 5 === 0 ? 'checked_out' : 'reserved',
          })
        );
      }
    }

    const result = aggregateDemandByDay({
      bookings: fixture,
      dayKeys,
      timezone: TZ,
    });

    for (const [day, count] of Object.entries(expected)) {
      expect(result.find((r) => r.date === day)?.bookedDemand).toBe(count);
    }
  });

  it('matches Flyparks SQL snapshot actual occupancy totals', () => {
    const expectedActual: Record<string, number> = {
      '2026-06-24': 151,
      '2026-06-25': 156,
      '2026-06-26': 141,
      '2026-06-27': 130,
      '2026-06-28': 132,
      '2026-06-29': 146,
      '2026-06-30': 138,
      '2026-07-01': 127,
      '2026-07-02': 125,
      '2026-07-03': 134,
      '2026-07-04': 130,
      '2026-07-05': 129,
      '2026-07-06': 136,
      '2026-07-07': 132,
      '2026-07-08': 129,
      '2026-07-09': 124,
      '2026-07-10': 121,
    };

    const booked: Record<string, number> = {
      '2026-06-24': 167,
      '2026-06-25': 176,
      '2026-06-26': 158,
      '2026-06-27': 144,
      '2026-06-28': 146,
      '2026-06-29': 160,
      '2026-06-30': 150,
      '2026-07-01': 135,
      '2026-07-02': 132,
      '2026-07-03': 137,
      '2026-07-04': 131,
      '2026-07-05': 130,
      '2026-07-06': 137,
      '2026-07-07': 133,
      '2026-07-08': 130,
      '2026-07-09': 124,
      '2026-07-10': 121,
    };

    const dayKeys = enumerateDateKeys('2026-06-24', '2026-07-10');
    const fixture: DemandBookingRow[] = [];

    for (const day of dayKeys) {
      const actualCount = expectedActual[day]!;
      const noShowCount = booked[day]! - actualCount;

      for (let i = 0; i < actualCount; i++) {
        fixture.push(
          booking({
            reference: `${day}-a${i}`,
            start_at: `${day}T08:00:00.000Z`,
            end_at: `${day}T18:00:00.000Z`,
          })
        );
      }
      for (let i = 0; i < noShowCount; i++) {
        fixture.push(
          booking({
            reference: `${day}-n${i}`,
            start_at: `${day}T08:00:00.000Z`,
            end_at: `${day}T18:00:00.000Z`,
            gate_status: GATE_STATUS.NO_SHOW,
          })
        );
      }
    }

    const result = aggregateDemandByDay({
      bookings: fixture,
      dayKeys,
      timezone: TZ,
    });

    for (const [day, count] of Object.entries(expectedActual)) {
      expect(result.find((r) => r.date === day)?.actualOccupancy).toBe(count);
      expect(result.find((r) => r.date === day)?.bookedDemand).toBe(booked[day]);
    }
  });
});
