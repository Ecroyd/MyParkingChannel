// Server-side quote for a customer stay change (extend / move dates).
// Uses calculateAvailability (the same pricing + capacity source as public checkout) for both
// the current and the requested stay, excluding the booking itself from capacity counts.
import { calculateAvailability } from '@/lib/availability/engine';

export type StayChangeQuote =
  | { ok: true; oldPriceCents: number; newPriceCents: number; soldOut: boolean; currency: string }
  | { ok: false; message: string };

export async function quoteStayChange(opts: {
  tenantId: string;
  reference: string;
  currentStartAt: string;
  currentEndAt: string;
  newStartAt: string;
  newEndAt: string;
}): Promise<StayChangeQuote> {
  const common = { tenantId: opts.tenantId, currency: 'GBP', channel: 'direct' as const, excludeReference: opts.reference };
  try {
    const [current, requested] = await Promise.all([
      calculateAvailability({ ...common, startAt: opts.currentStartAt, endAt: opts.currentEndAt }),
      calculateAvailability({ ...common, startAt: opts.newStartAt, endAt: opts.newEndAt }),
    ]);
    const newPriceCents = Math.round(Number(requested.pricing.total_price) * 100);
    const oldPriceCents = Math.round(Number(current.pricing.total_price) * 100);
    // A zero price means the engine could not price the stay (it returns 0 on internal errors).
    // Never treat that as "free".
    // Likewise a zero current price would overcharge the customer for the whole stay.
    if (!Number.isFinite(newPriceCents) || newPriceCents <= 0 || !Number.isFinite(oldPriceCents) || oldPriceCents <= 0) {
      return { ok: false, message: 'We could not price those dates. Please contact the car park to change your booking.' };
    }
    return {
      ok: true,
      oldPriceCents,
      newPriceCents,
      // 'closed' is deliberately not treated as sold out: it is also returned when capacity rows are missing.
      soldOut: requested.availability_status === 'sold_out',
      currency: (requested.currency || 'GBP').toUpperCase(),
    };
  } catch (e: any) {
    console.error('[manage-booking] stay change quote failed:', e?.message || e);
    return { ok: false, message: 'We could not price those dates. Please contact the car park to change your booking.' };
  }
}

export const SOLD_OUT_MESSAGE = 'Sorry, there are no spaces left for those dates. Please choose different times or contact the car park.';
