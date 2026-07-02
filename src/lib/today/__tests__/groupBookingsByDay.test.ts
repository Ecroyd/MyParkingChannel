import { describe, expect, it } from 'vitest';
import {
  groupArrivalsAndDeparturesByDay,
  groupOverlappingBookingsByDay,
} from '@/lib/today/groupBookingsByDay';

describe('groupBookingsByDay', () => {
  it('groups overlapping parked bookings by tenant-local day', () => {
    const bookings = [
      {
        id: '1',
        start_at: '2026-06-28T03:00:00.000Z',
        end_at: '2026-07-02T21:00:00.000Z',
      },
    ];

    const grouped = groupOverlappingBookingsByDay(
      bookings,
      '2026-06-28',
      '2026-07-02',
      'Europe/London'
    );

    expect(grouped.map((g) => g.date)).toEqual([
      '2026-06-28',
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
    ]);
    expect(grouped.every((g) => g.bookings.length === 1)).toBe(true);
  });

  it('groups arrivals and departures in one pass per day', () => {
    const arrivals = [
      { id: 'a1', start_at: '2026-06-24T10:00:00.000Z', end_at: '2026-06-26T10:00:00.000Z' },
      { id: 'a2', start_at: '2026-06-25T10:00:00.000Z', end_at: '2026-06-27T10:00:00.000Z' },
    ];
    const departures = [
      { id: 'd1', start_at: '2026-06-20T10:00:00.000Z', end_at: '2026-06-24T18:00:00.000Z' },
    ];

    const grouped = groupArrivalsAndDeparturesByDay(arrivals, departures, 'Europe/London');

    const day24 = grouped.find((g) => g.date === '2026-06-24');
    expect(day24?.arrivals.map((b) => b.id)).toEqual(['a1']);
    expect(day24?.departures.map((b) => b.id)).toEqual(['d1']);
  });
});
