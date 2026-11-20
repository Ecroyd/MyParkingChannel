import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  correctDirectionFromBooking,
  findDuplicateCapture,
  normalizePlate,
  pickCaptureBooking,
  plateIlikePattern,
} from '@/lib/anpr/captureBookingMatch';

function gateEventsStub(result: { data: unknown; error: unknown }) {
  const q: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'eq', 'gte', 'lte', 'order']) q[m] = vi.fn(() => q);
  q.limit = vi.fn(async () => result);
  return { client: { from: vi.fn(() => q) } as unknown as SupabaseClient, q };
}

describe('findDuplicateCapture', () => {
  const at = new Date('2026-10-30T08:00:00Z');

  it('looks for the same plate and direction within a minute either side, any camera', async () => {
    const { client, q } = gateEventsStub({ data: [{ id: 'ev-1', booking_id: 'b-1', result: 'allow' }], error: null });
    await expect(findDuplicateCapture(client, 'tenant', 'AB12CDE', 'in', at)).resolves.toEqual({
      id: 'ev-1',
      booking_id: 'b-1',
      result: 'allow',
    });
    expect(q.eq).toHaveBeenCalledWith('plate_norm', 'AB12CDE');
    expect(q.eq).toHaveBeenCalledWith('direction', 'in');
    expect(q.eq).not.toHaveBeenCalledWith('camera_id', expect.anything());
    expect(q.gte).toHaveBeenCalledWith('event_at', '2026-10-30T07:59:00.000Z');
    expect(q.lte).toHaveBeenCalledWith('event_at', '2026-10-30T08:01:00.000Z');
  });

  it('returns null when there is none, and never blocks a read when the check fails', async () => {
    await expect(findDuplicateCapture(gateEventsStub({ data: [], error: null }).client, 't', 'X', 'out', at)).resolves.toBeNull();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      findDuplicateCapture(gateEventsStub({ data: null, error: { message: 'boom' } }).client, 't', 'X', 'out', at)
    ).resolves.toBeNull();
  });
});

const booking = (id: string, plate: string | null, start: string, end: string) => ({
  id,
  plate,
  start_at: start,
  end_at: end,
});

describe('normalizePlate', () => {
  it('strips spaces and punctuation and upper-cases', () => {
    expect(normalizePlate(' ab12 cde ')).toBe('AB12CDE');
    expect(normalizePlate('AB-12.CDE')).toBe('AB12CDE');
    expect(normalizePlate(null)).toBe('');
  });
});

describe('plateIlikePattern', () => {
  it('lets any separators sit between characters', () => {
    expect(plateIlikePattern('AB12CDE')).toBe('A%B%1%2%C%D%E');
  });
});

describe('pickCaptureBooking', () => {
  const at = new Date('2026-10-30T08:00:00Z');

  it('matches a booking saved with a space against a camera read without one', () => {
    const picked = pickCaptureBooking(
      [booking('b1', 'AB12 CDE', '2026-10-30T07:30:00Z', '2026-11-06T18:00:00Z')],
      'AB12CDE',
      'in',
      at
    );
    expect(picked?.id).toBe('b1');
  });

  it('drops candidates the ILIKE pattern over-matched', () => {
    const picked = pickCaptureBooking(
      [booking('b1', 'AXB12CDE', '2026-10-30T07:30:00Z', '2026-11-06T18:00:00Z')],
      'AB12CDE',
      'in',
      at
    );
    expect(picked).toBeNull();
  });

  it('picks the closest start for IN and the closest end for OUT', () => {
    const early = booking('early', 'AB12CDE', '2026-10-30T02:00:00Z', '2026-10-30T08:30:00Z');
    const late = booking('late', 'AB12CDE', '2026-10-30T09:00:00Z', '2026-11-02T10:00:00Z');
    expect(pickCaptureBooking([early, late], 'AB12CDE', 'in', at)?.id).toBe('late');
    expect(pickCaptureBooking([early, late], 'AB12CDE', 'out', at)?.id).toBe('early');
  });
});

describe('correctDirectionFromBooking', () => {
  const booking = (b: Partial<Parameters<typeof correctDirectionFromBooking>[0]>) => ({
    id: 'b1',
    plate: 'HU60AAA',
    start_at: '2026-11-20T10:00:00Z',
    end_at: '2026-11-27T10:00:00Z',
    arrived_at: null,
    departed_at: null,
    ...b,
  });
  const at = (iso: string) => new Date(iso);

  it('treats an exit read of a car that has not arrived, near its start, as an arrival', () => {
    expect(correctDirectionFromBooking(booking({}), 'out', at('2026-11-20T09:40:00Z')).direction).toBe('in');
    expect(correctDirectionFromBooking(booking({}), 'out', at('2026-11-20T18:00:00Z')).direction).toBe('in');
  });

  it('leaves an exit read alone well after the start or once arrived', () => {
    expect(correctDirectionFromBooking(booking({}), 'out', at('2026-11-21T09:00:00Z')).direction).toBe('out');
    expect(
      correctDirectionFromBooking(booking({ arrived_at: '2026-11-20T09:30:00Z' }), 'out', at('2026-11-27T09:00:00Z'))
    ).toEqual({ direction: 'out', reason: null });
  });

  it('treats an entrance read of a parked car as a departure, but not a repeat read on arrival', () => {
    const parked = booking({ arrived_at: '2026-11-20T09:30:00Z' });
    expect(correctDirectionFromBooking(parked, 'in', at('2026-11-27T09:00:00Z')).direction).toBe('out');
    expect(correctDirectionFromBooking(parked, 'in', at('2026-11-20T09:35:00Z')).direction).toBe('in');
  });

  it('never changes a booking that has already departed', () => {
    const gone = booking({ arrived_at: '2026-11-20T09:30:00Z', departed_at: '2026-11-27T09:00:00Z' });
    expect(correctDirectionFromBooking(gone, 'in', at('2026-11-28T09:00:00Z')).direction).toBe('in');
  });
});
