// src/lib/promo/adminAccess.ts
//
// Promo codes are part of pricing, so only admins and owners of the car park manage them.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, createServerClient } from '@/lib/supabase/server';
import { canManagePricing, normalizeRole } from '@/lib/auth/permissions';

export type PromoAdminContext = { userId: string; tenantId: string; admin: SupabaseClient };

export async function requirePromoAdmin(
  tenantId: string | null | undefined
): Promise<{ ok: true; ctx: PromoAdminContext } | { ok: false; response: NextResponse }> {
  if (!tenantId) {
    return { ok: false, response: NextResponse.json({ error: 'tenantId is required' }, { status: 400 }) };
  }
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('user_tenants')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!membership || !canManagePricing(normalizeRole(membership.role))) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 }),
    };
  }
  return { ok: true, ctx: { userId: user.id, tenantId, admin } };
}
