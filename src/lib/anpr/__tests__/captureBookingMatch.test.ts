import { describe, it, expect } from 'vitest';
import {
  normalizePlate,
  pickCaptureBooking,
  plateIlikePattern,
} from '@/lib/anpr/captureBookingMatch';

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
