// src/lib/anpr/captureBookingMatch.ts
//
// Booking matching for ANPR capture reads (POST /api/internal/anpr/capture).
// Booking plates are not stored consistently (some writers keep spaces, e.g. "AB12 CDE"), so the
// database query uses a spacing-insensitive ILIKE pattern and the exact comparison happens here
// on the normalised plate.

export type CaptureDirection = 'in' | 'out';

export type CaptureBookingCandidate = {
  id: string;
  plate: string | null;
  start_at: string;
  end_at: string;
};

/** UPPER(alnum only) — the same normalisation the camera read gets. */
export function normalizePlate(plate: string | null | undefined): string {
  return (plate ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * ILIKE pattern that matches the plate whatever spacing or punctuation the booking was saved
 * with: "AB12CDE" → "A%B%1%2%C%D%E". It can over-match, so callers must filter the results
 * with normalizePlate equality (pickCaptureBooking does).
 */
export function plateIlikePattern(plateNorm: string): string {
  return plateNorm.split('').join('%');
}

/**
 * Choose the booking a read belongs to: only candidates whose normalised plate equals the read,
 * then the closest start (IN) or closest end (OUT) to the read time.
 */
export function pickCaptureBooking<T extends CaptureBookingCandidate>(
  candidates: T[],
  plateNorm: string,
  direction: CaptureDirection,
  occurredAt: Date
): T | null {
  const t = occurredAt.getTime();
  let best: T | null = null;
  let bestDiff = Infinity;
  for (const c of candidates) {
    if (normalizePlate(c.plate) !== plateNorm) continue;
    const anchor = new Date(direction === 'in' ? c.start_at : c.end_at).getTime();
    const diff = Math.abs(t - anchor);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best;
}
