// POST /api/promo/validate - public: check a promo code against a stay on the booking site.
// Body: { tenantId, code, startAt, endAt }. Prices the stay the same way checkout does, so the
// figure shown is the figure charged. Checkout re-checks the code; this only previews it.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateAvailability } from '@/lib/availability/engine';
import { evaluatePromoCode } from '@/lib/promo/promoCodes';
import { findPromoCode } from '@/lib/promo/promoCodeStore';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
  const startAt = typeof body.startAt === 'string' ? body.startAt : '';
  const endAt = typeof body.endAt === 'string' ? body.endAt : '';
  if (!tenantId || !startAt || !endAt || !body.code) {
    return NextResponse.json({ ok: false, reason: 'Enter a code and your dates.' }, { status: 400 });
  }

  try {
    const availability = await calculateAvailability({
      tenantId,
      startAt,
      endAt,
      currency: 'GBP',
      channel: 'direct',
    });
    const amount = availability.pricing.total_price;

    const promo = await findPromoCode(createAdminClient(), tenantId, body.code);
    const result = evaluatePromoCode(promo, amount);
    if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason, amount });

    return NextResponse.json({
      ok: true,
      code: result.code,
      label: result.label,
      amount,
      discount: result.discount,
      finalAmount: result.finalAmount,
    });
  } catch (err) {
    console.error('[promo] validate failed:', err);
    return NextResponse.json({ ok: false, reason: "Couldn't check that code. Please try again." }, { status: 500 });
  }
}
