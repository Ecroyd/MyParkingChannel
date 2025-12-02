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
  const { createAdminClient } = await import('@/lib/supabase/server-admin');
  const adminClient = createAdminClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  // Try to get tenant from request (subdomain/headers)
  let tenant = await getTenantFromRequest(headerStore);
  let tenantId: string | null = null;
  let tenantSlug: string | null = null;

  if (tenant) {
    tenantId = tenant.id;
    tenantSlug = tenant.slug;
  } else {
    // Fallback: get user's default tenant from user_tenants
    // Use admin client to bypass RLS (user might have just joined)
    console.log('🔍 [TENANT CONTEXT] No tenant from request, checking user_tenants for user:', user.id);
    const { data: userTenant, error: userTenantError } = await adminClient
      .from('user_tenants')
      .select('tenant_id, role, is_default, tenants!inner(id, slug)')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle();

    console.log('🔍 [TENANT CONTEXT] Default tenant query:', { 
      hasData: !!userTenant, 
      error: userTenantError?.message,
      tenantId: userTenant?.tenant_id 
    });

    if (!userTenantError && userTenant) {
      const tenantData = Array.isArray(userTenant.tenants) ? userTenant.tenants[0] : userTenant.tenants;
      tenantId = tenantData.id;
      tenantSlug = tenantData.slug;
      console.log('✅ [TENANT CONTEXT] Found default tenant:', { tenantId, tenantSlug });
    } else {
      // If no default, try to get any tenant
      console.log('🔍 [TENANT CONTEXT] No default tenant, checking for any tenant...');
      const { data: anyTenant, error: anyTenantError } = await adminClient
        .from('user_tenants')
        .select('tenant_id, role, tenants!inner(id, slug)')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      console.log('🔍 [TENANT CONTEXT] Any tenant query:', { 
        hasData: !!anyTenant, 
        error: anyTenantError?.message,
        tenantId: anyTenant?.tenant_id 
      });

      if (!anyTenantError && anyTenant) {
        const tenantData = Array.isArray(anyTenant.tenants) ? anyTenant.tenants[0] : anyTenant.tenants;
        tenantId = tenantData.id;
        tenantSlug = tenantData.slug;
        console.log('✅ [TENANT CONTEXT] Found any tenant:', { tenantId, tenantSlug });
      } else {
        console.log('❌ [TENANT CONTEXT] No tenants found for user');
      }
    }
  }

  if (!tenantId || !tenantSlug) return null;

  // Get user's role for this tenant (use admin client to bypass RLS)
  const { data: membership, error: membershipError } = await adminClient
    .from('user_tenants')
    .select('role')
    .eq('tenant_id', tenantId)
    .eq('user_id', user.id)
    .maybeSingle();

  console.log('🔍 [TENANT CONTEXT] Membership query:', { 
    hasData: !!membership, 
    error: membershipError?.message,
    role: membership?.role 
  });

  if (membershipError || !membership) return null;

  return {
    tenantId,
    tenantSlug,
    userId: user.id,
    role: membership.role as UserRole,
  };
}

