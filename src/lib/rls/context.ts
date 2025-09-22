import { getServerSupabase } from '@/lib/supabase/server'
import { TenantContext } from '@/lib/tenant/resolveTenant'

export async function setRLSContext(tenantId: string, userId?: string) {
  const supabase = await getServerSupabase()
  
  // Set the tenant context for RLS
  await supabase.rpc('set_tenant_context', {
    tenant_id: tenantId,
    user_id: userId
  })
  
  return supabase
}

export async function createTenantScopedClient(tenant: TenantContext, userId?: string) {
  const supabase = await setRLSContext(tenant.tenant_id, userId)
  return supabase
}

