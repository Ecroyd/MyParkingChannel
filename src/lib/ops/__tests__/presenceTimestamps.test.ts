import { describe, expect, it } from 'vitest';
import {
  applyArrivalTimestamps,
  applyDepartureTimestamps,
  clearPresenceTimestamps,
} from '../presenceTimestamps';

describe('presenceTimestamps', () => {
  const now = '2026-07-16T12:00:00.000Z';

  it('sets arrival timestamps only when null and clears checkout', () => {
    expect(applyArrivalTimestamps({}, now)).toEqual({
      arrived_at: now,
      checked_in_at: now,
      checked_out_at: null,
    });
    expect(
      applyArrivalTimestamps(
        { arrived_at: '2026-07-16T08:00:00.000Z', checked_in_at: '2026-07-16T08:00:00.000Z' },
        now
      )
    ).toEqual({
      arrived_at: '2026-07-16T08:00:00.000Z',
      checked_in_at: '2026-07-16T08:00:00.000Z',
      checked_out_at: null,
    });
  });

  it('sets departure timestamps only when null', () => {
    expect(
      applyDepartureTimestamps({ arrived_at: '2026-07-16T08:00:00.000Z' }, now)
    ).toEqual({
      arrived_at: '2026-07-16T08:00:00.000Z',
      checked_in_at: '2026-07-16T08:00:00.000Z',
      departed_at: now,
      checked_out_at: now,
    });
  });

  it('clears all presence timestamps on correction/cancel', () => {
    expect(clearPresenceTimestamps()).toEqual({
      arrived_at: null,
      departed_at: null,
      checked_in_at: null,
      checked_out_at: null,
    });
  });
});
