// GET  /api/admin/promo-codes?tenantId=… - list the car park's promo codes
// POST /api/admin/promo-codes              - create one

import { NextRequest, NextResponse } from 'next/server';
import { requirePromoAdmin } from '@/lib/promo/adminAccess';
import { parsePromoInput } from '@/lib/promo/promoCodes';
import { PROMO_CODE_COLUMNS } from '@/lib/promo/promoCodeStore';

export async function GET(req: NextRequest) {
  const auth = await requirePromoAdmin(new URL(req.url).searchParams.get('tenantId'));
  if (!auth.ok) return auth.response;
  const { admin, tenantId } = auth.ctx;

  const { data, error } = await admin
    .from('promo_codes')
    .select(PROMO_CODE_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[promo] list failed:', error);
    return NextResponse.json({ error: 'Failed to load promo codes' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await requirePromoAdmin(typeof body.tenantId === 'string' ? body.tenantId : null);
  if (!auth.ok) return auth.response;
  const { admin, tenantId, userId } = auth.ctx;

  const parsed = parsePromoInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await admin
    .from('promo_codes')
    .insert({ ...parsed.input, tenant_id: tenantId, created_by: userId })
    .select(PROMO_CODE_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `There is already a code called ${parsed.input.code}.` }, { status: 409 });
    }
    console.error('[promo] create failed:', error);
    return NextResponse.json({ error: 'Failed to create promo code' }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}
