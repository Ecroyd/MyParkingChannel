import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { isPlatformAdmin } from '@/lib/guards';
import { normalizeRole, type UserRole } from './permissions';
import { validateCronAuth } from '@/lib/jobSecret';

/**
 * Route-handler guards. Each returns `{ response }` set to a 401/403 when the caller
 * is not allowed, so routes can `if (guard.response) return guard.response;`.
 * Unlike requireUser() these never redirect, which is what API callers expect.
 */

type GuardFail = { ok: false; response: NextResponse };

function fail(status: 401 | 403, message: string): GuardFail {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}

async function getSessionUser(): Promise<User | null> {
  try {
    const sb = await getServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}

export async function requirePlatformAdminApi(): Promise<
  { ok: true; response: null; user: User } | GuardFail
> {
  const user = await getSessionUser();
  if (!user) return fail(401, 'Not authenticated');
  if (!(await isPlatformAdmin(user.id))) return fail(403, 'Platform admin access required');
  return { ok: true, response: null, user };
}

/**
 * Caller must be signed in and a member of `tenantId` (optionally with one of `roles`).
 * Platform admins pass for any tenant.
 */
export async function requireTenantMemberApi(
  tenantId: string | null | undefined,
  roles?: readonly UserRole[]
): Promise<{ ok: true; response: null; user: User; role: UserRole | 'platform_admin' } | GuardFail> {
  const user = await getSessionUser();
  if (!user) return fail(401, 'Not authenticated');
  if (!tenantId || typeof tenantId !== 'string') return fail(403, 'Tenant access denied');

  if (await isPlatformAdmin(user.id)) {
    return { ok: true, response: null, user, role: 'platform_admin' };
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('user_tenants')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!membership) return fail(403, 'Tenant access denied');
  const role = normalizeRole(membership.role);
  if (roles && !roles.includes(role)) return fail(403, 'Insufficient role');
  return { ok: true, response: null, user, role };
}

/** Cron/job secrets from jobSecret.ts, plus the `x-internal-cron-key` header used by /api/internal/cron/*. */
export function isCronRequest(req: Request): boolean {
  if (validateCronAuth(req)) return true;
  const internalKey = process.env.INTERNAL_CRON_KEY?.trim();
  const headerKey = req.headers.get('x-internal-cron-key')?.trim();
  return !!internalKey && !!headerKey && headerKey === internalKey;
}

/** Accepts a cron/job secret or, failing that, a platform admin session. */
export async function requireCronOrPlatformAdminApi(
  req: Request
): Promise<{ ok: true; response: null } | GuardFail> {
  if (isCronRequest(req)) return { ok: true, response: null };
  const guard = await requirePlatformAdminApi();
  return guard.ok ? { ok: true, response: null } : guard;
}

/** Accepts a cron/job secret or a signed-in member of `tenantId`. */
export async function requireCronOrTenantMemberApi(
  req: Request,
  tenantId: string | null | undefined,
  roles?: readonly UserRole[]
): Promise<{ ok: true; response: null } | GuardFail> {
  if (isCronRequest(req)) return { ok: true, response: null };
  const guard = await requireTenantMemberApi(tenantId, roles);
  return guard.ok ? { ok: true, response: null } : guard;
}
