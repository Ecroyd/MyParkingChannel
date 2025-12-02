import { cookies, headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { resolveTenantIdOrThrow } from '@/lib/tenant/resolve';
import type { UserRole } from './permissions';

export type CurrentTenantContext = {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  role: UserRole;
};

/**
 * Helper to get tenant from request headers/host
 * This matches the pattern the user specified: getTenantFromRequest(headers)
 */
async function getTenantFromRequest(headerStore: Headers): Promise<{ id: string; slug: string } | null> {
  try {
    const tenantId = await resolveTenantIdOrThrow();
    
    // Get tenant slug - we need admin client to bypass RLS if needed
    const { createAdminClient } = await import('@/lib/supabase/server-admin');
    const adminClient = createAdminClient();
    const { data: tenantData, error: tenantError } = await adminClient
      .from('tenants')
      .select('id, slug')
      .eq('id', tenantId)
      .maybeSingle();
    
    if (tenantError || !tenantData) return null;
    
    return {
      id: tenantData.id,
      slug: tenantData.slug,
    };
  } catch (error) {
    return null;
  }
}

export async function getCurrentTenantContext(): Promise<CurrentTenantContext | null> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const supabase = await createServerClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const tenant = await getTenantFromRequest(headerStore);
  if (!tenant) return null;

  const { data: membership, error: membershipError } = await supabase
    .from('user_tenants')
    .select('role')
    .eq('tenant_id', tenant.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError || !membership) return null;

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    userId: user.id,
    role: membership.role as UserRole,
  };
}

