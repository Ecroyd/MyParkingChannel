import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { canViewFinancials, normalizeRole, type UserRole } from './permissions';

export type FinancialsGuardResult =
  | { ok: true; userId: string; tenantId: string; role: UserRole }
  | { ok: false; response: NextResponse };

/**
 * Guard for any endpoint returning revenue, payouts, pricing or per-booking
 * amounts. Tenant membership alone is not sufficient: roles in
 * ROLES_WITHOUT_FINANCIALS are members but must not receive money values, so
 * every financial endpoint has to check the role and not just the membership row.
 */
export async function requireFinancialsAccess(tenantId: string | null | undefined): Promise<FinancialsGuardResult> {
  if (!tenantId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Missing tenantId' }, { status: 400 }),
    };
  }

  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const adminSupabase = await createAdminClient();
  const { data: membership } = await adminSupabase
    .from('user_tenants')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
    };
  }

  const role = normalizeRole(membership.role);

  if (!canViewFinancials(role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Your role does not have access to financial data' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId: user.id, tenantId, role };
}
