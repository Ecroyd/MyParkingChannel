import { describe, expect, it } from 'vitest';
import { groupUnmatchedReads, type UnmatchedRead } from '../unmatchedVehicles';

const read = (r: Partial<UnmatchedRead>): UnmatchedRead => ({
  id: 'e1',
  event_at: '2026-11-11T09:00:00Z',
  direction: 'in',
  plate: 'WG15 TZZ',
  plate_norm: 'WG15TZZ',
  raw_payload: null,
  ...r,
});

describe('groupUnmatchedReads', () => {
  it('groups reads by plate, newest first, with in/out counts and the latest read', () => {
    const out = groupUnmatchedReads([
      read({ id: 'a', event_at: '2026-11-11T09:00:00Z', direction: 'in' }),
      read({ id: 'b', event_at: '2026-11-11T12:00:00Z', direction: 'out' }),
      read({ id: 'c', event_at: '2026-11-11T10:00:00Z', plate: 'LF21AZD', plate_norm: 'LF21AZD', direction: 'out' }),
    ]);
    expect(out.map((v) => [v.plate, v.reads, v.ins, v.outs, v.lastDirection, v.lastEventId])).toEqual([
      ['WG15TZZ', 2, 1, 1, 'out', 'b'],
      ['LF21AZD', 1, 0, 1, 'out', 'c'],
    ]);
    expect(out[0].firstSeen).toBe('2026-11-11T09:00:00Z');
  });

  it('leaves out staff plates, whatever their spacing', () => {
    expect(groupUnmatchedReads([read({})], ['wg15 tzz'])).toEqual([]);
  });

  it('reads make and colour from the stored payload, as JSON text or an object', () => {
    const [a] = groupUnmatchedReads([read({ raw_payload: JSON.stringify({ vehicleLogo: 'HONDA', vehicleColor: 'gray' }) })]);
    expect([a.make, a.colour]).toEqual(['Honda', 'Gray']);
    const [b] = groupUnmatchedReads([read({ raw_payload: { vehicleLogo: 'unknown', vehicleColor: 'white' } })]);
    expect([b.make, b.colour]).toEqual([null, 'White']);
    const [c] = groupUnmatchedReads([read({ raw_payload: 'not json' })]);
    expect([c.make, c.colour]).toEqual([null, null]);
  });

  it('hides reads up to when a plate was dismissed, but shows a later visit', () => {
    const rows = [
      read({ id: 'a', event_at: '2026-11-11T09:00:00Z' }),
      read({ id: 'b', event_at: '2026-11-11T15:00:00Z' }),
    ];
    expect(groupUnmatchedReads(rows, [], [{ plate_norm: 'WG15TZZ', dismissed_at: '2026-11-11T16:00:00Z' }])).toEqual([]);
    const [v] = groupUnmatchedReads(rows, [], [{ plate_norm: 'WG15TZZ', dismissed_at: '2026-11-11T10:00:00Z' }]);
    expect([v.reads, v.lastEventId]).toEqual([1, 'b']);
  });
});
