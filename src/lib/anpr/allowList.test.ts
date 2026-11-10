import { describe, expect, it } from 'vitest';
import { buildAllowList, type AllowListBooking } from './allowList';

const now = new Date('2026-11-10T12:00:00Z');
const booking = (b: Partial<AllowListBooking>): AllowListBooking => ({
  plate: 'AB12 CDE',
  start_at: '2026-11-11T08:00:00Z',
  end_at: '2026-11-15T18:00:00Z',
  status: 'confirmed',
  arrived_at: null,
  departed_at: null,
  ...b,
});

describe('buildAllowList', () => {
  it('allows a booked plate from 12h before start to 12h after end', () => {
    expect(buildAllowList([booking({})], [], now)).toEqual([
      { plate: 'AB12CDE', validFrom: '2026-11-10T20:00:00.000Z', validUntil: '2026-11-16T06:00:00.000Z', reason: 'booking' },
    ]);
  });

  it('leaves out cancelled, departed, far-future, long-finished and plate-less bookings', () => {
    const out = buildAllowList(
      [
        booking({ plate: 'CAN1', status: 'cancelled' }),
        booking({ plate: 'GONE1', arrived_at: '2026-11-09T08:00:00Z', departed_at: '2026-11-10T09:00:00Z' }),
        booking({ plate: 'LATER1', start_at: '2026-11-20T08:00:00Z', end_at: '2026-11-25T08:00:00Z' }),
        booking({ plate: 'OLD1', start_at: '2026-11-01T08:00:00Z', end_at: '2026-11-09T08:00:00Z' }),
        booking({ plate: null }),
      ],
      [],
      now
    );
    expect(out).toEqual([]);
  });

  it('keeps an overdue car that is still on site allowed out', () => {
    const [e] = buildAllowList(
      [booking({ plate: 'LATE1', start_at: '2026-11-01T08:00:00Z', end_at: '2026-11-05T08:00:00Z', arrived_at: '2026-11-01T07:30:00Z' })],
      [],
      now
    );
    expect(e).toMatchObject({ plate: 'LATE1', reason: 'on_site', validUntil: '2026-11-12T12:00:00.000Z' });
  });

  it('merges a plate across bookings and staff into one widest entry', () => {
    const out = buildAllowList(
      [
        booking({ plate: 'ab12cde', start_at: '2026-11-11T08:00:00Z', end_at: '2026-11-12T08:00:00Z' }),
        booking({ plate: 'AB12-CDE', start_at: '2026-11-14T08:00:00Z', end_at: '2026-11-16T08:00:00Z' }),
      ],
      ['STAFF 1', ''],
      now
    );
    expect(out.map((e) => [e.plate, e.validFrom, e.validUntil, e.reason])).toEqual([
      ['AB12CDE', '2026-11-10T20:00:00.000Z', '2026-11-16T20:00:00.000Z', 'booking'],
      ['STAFF1', '2026-11-09T12:00:00.000Z', '2027-11-10T12:00:00.000Z', 'staff'],
    ]);
  });
});
