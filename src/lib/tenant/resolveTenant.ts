import { createClient } from '@supabase/supabase-js'

export interface TenantContext {
  tenant_id: string
  slug: string
  timezone: string
}

export class TenantNotFoundError extends Error {
  constructor(message: string = 'Tenant not found') {
    super(message)
    this.name = 'TenantNotFoundError'
  }
}

export async function resolveTenant(
  host: string,
  tenantSlug?: string
): Promise<TenantContext> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  
  // First try to resolve by domain
  if (host) {
    const { data: domainData, error: domainError } = await supabase
      .from('tenant_domains')
      .select(`
        tenant_id,
        tenants!inner(
          id,
          slug,
          timezone
        )
      `)
      .eq('domain', host)
      .single()

    if (!domainError && domainData) {
      return {
        tenant_id: domainData.tenant_id,
        slug: domainData.tenants.slug,
        timezone: domainData.tenants.timezone || 'Europe/London'
      }
    }
  }

  // Fallback to tenant slug from query parameter
  if (tenantSlug) {
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('id, slug, timezone')
      .eq('slug', tenantSlug)
      .eq('status', 'active')
      .single()

    if (!tenantError && tenantData) {
      return {
        tenant_id: tenantData.id,
        slug: tenantData.slug,
        timezone: tenantData.timezone || 'Europe/London'
      }
    }
  }

  throw new TenantNotFoundError()
}

