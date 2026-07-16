import { describe, expect, it } from 'vitest';
import { applyDepartureTimestamps } from '../presenceTimestamps';

describe('departure mutation atomic fields', () => {
  it('departure timestamps preserve original departed_at and set checkout compatibility', () => {
    const now = '2026-07-16T15:00:00.000Z';
    const original = '2026-07-16T13:27:22.271Z';
    const result = applyDepartureTimestamps(
      {
        arrived_at: '2026-07-02T09:46:06.188Z',
        checked_in_at: '2026-07-02T09:46:06.188Z',
        departed_at: original,
        checked_out_at: null,
      },
      now
    );
    expect(result.departed_at).toBe(original);
    expect(result.checked_out_at).toBe(now);
    expect(result.arrived_at).toBe('2026-07-02T09:46:06.188Z');
  });

  it('duplicate departure leaves departed_at unchanged (idempotent timestamp)', () => {
    const now = '2026-07-16T16:00:00.000Z';
    const original = '2026-07-16T13:27:22.271Z';
    const first = applyDepartureTimestamps(
      { arrived_at: '2026-07-02T09:46:06.188Z', departed_at: null },
      original
    );
    const second = applyDepartureTimestamps(first, now);
    expect(second.departed_at).toBe(original);
    expect(second.checked_out_at).toBe(original);
  });
});
