import { createAdminClient, createServerClient } from '@/lib/supabase/server';

export type AuthorizedAnprAdmin = {
  userId: string;
  tenantId: string;
  role: string;
  adminClient: ReturnType<typeof createAdminClient>;
};

/**
 * Authenticate the admin user and resolve the authorised tenant on the server.
 * Browser-supplied tenant_id is ignored for authorisation — membership is required
 * only against the server-resolved default/first tenant, unless `preferredTenantId`
 * is a tenant the user actually belongs to (optional convenience for multi-tenant).
 *
 * Security rule: never trust a bare client tenant id without membership check.
 * Final queries always use the returned `tenantId`.
 */
export async function resolveAuthorizedAnprAdmin(
  preferredTenantId?: string | null
): Promise<
  | { ok: true; ctx: AuthorizedAnprAdmin }
  | { ok: false; status: number; error: string }
> {
  const supabase = await createServerClient();
  const adminClient = createAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, status: 401, error: 'Not authenticated' };
  }

  const { data: memberships, error: membershipError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (membershipError || !memberships?.length) {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  let chosen =
    memberships.find((m) => m.is_default) || memberships[0];

  // Optional: if client hints a tenant and user is a member, allow that switch.
  // Still never accept a tenant the user does not belong to.
  if (preferredTenantId) {
    const match = memberships.find((m) => m.tenant_id === preferredTenantId);
    if (match) chosen = match;
  }

  if (!chosen?.tenant_id) {
    return { ok: false, status: 403, error: 'Access denied' };
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      tenantId: chosen.tenant_id,
      role: chosen.role,
      adminClient,
    },
  };
}
