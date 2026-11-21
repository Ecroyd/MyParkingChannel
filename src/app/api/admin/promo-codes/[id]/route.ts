// PUT    /api/admin/promo-codes/[id] - edit a code (send the whole form), or just { is_active }
// DELETE /api/admin/promo-codes/[id]?tenantId=… - delete a code

import { NextRequest, NextResponse } from 'next/server';
import { requirePromoAdmin } from '@/lib/promo/adminAccess';
import { parsePromoInput } from '@/lib/promo/promoCodes';
import { PROMO_CODE_COLUMNS } from '@/lib/promo/promoCodeStore';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const auth = await requirePromoAdmin(typeof body.tenantId === 'string' ? body.tenantId : null);
  if (!auth.ok) return auth.response;
  const { admin, tenantId } = auth.ctx;

  // A pause/resume toggle sends only is_active; an edit sends the full form.
  let updates: Record<string, unknown>;
  if (body.code === undefined && typeof body.is_active === 'boolean') {
    updates = { is_active: body.is_active };
  } else {
    const parsed = parsePromoInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    updates = { ...parsed.input };
  }

  const { data, error } = await admin
    .from('promo_codes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(PROMO_CODE_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Another code already has that name.' }, { status: 409 });
    }
    console.error('[promo] update failed:', error);
    return NextResponse.json({ error: 'Failed to update promo code' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Promo code not found' }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requirePromoAdmin(new URL(req.url).searchParams.get('tenantId'));
  if (!auth.ok) return auth.response;
  const { admin, tenantId } = auth.ctx;

  const { error } = await admin.from('promo_codes').delete().eq('id', id).eq('tenant_id', tenantId);
  if (error) {
    console.error('[promo] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete promo code' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
