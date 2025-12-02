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
 * Get the current user's role for the current tenant context.
 * Resolves tenant from headers/subdomain and checks user_tenants membership.
 * Returns null if user is not authenticated or not a member of the tenant.
 */
export async function getCurrentTenantContext(): Promise<CurrentTenantContext | null> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const supabase = await createServerClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  // Resolve tenant ID from request (uses headers, subdomain, etc.)
  let tenantId: string;
  let tenantSlug: string;
  try {
    tenantId = await resolveTenantIdOrThrow();
    
    // Get tenant slug for the resolved tenant
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('id, slug')
      .eq('id', tenantId)
      .maybeSingle();
    
    if (tenantError || !tenantData) return null;
    tenantSlug = tenantData.slug;
  } catch (error) {
    // Tenant not resolved - user might not be in a tenant context
    return null;
  }

  // Get user's role for this tenant
  const { data: membership, error: membershipError } = await supabase
    .from('user_tenants')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError || !membership) return null;

  return {
    tenantId,
    tenantSlug,
    userId: user.id,
    role: membership.role as UserRole,
  };
}

