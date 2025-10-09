// src/app/site/[domain]/page.tsx
import { redirect } from 'next/navigation'

async function getTenantByDomain(domain: string) {
  console.log('🔍 [SITE] Starting domain lookup for:', domain)
  
  // Use admin client to bypass RLS policies
  const { createAdminClient } = await import('@/lib/supabase/server')
  const supabase = await createAdminClient()

  // First try to find tenant by domain in tenant_domains table
  console.log('🔍 [SITE] Checking tenant_domains table...')
  const { data: tenantDomain, error: tenantDomainError } = await supabase
    .from('tenant_domains')
    .select('tenant_id, tenants!inner(id, slug, name)')
    .eq('domain', domain)
    .maybeSingle()

  console.log('🔍 [SITE] tenant_domains result:', { tenantDomain, error: tenantDomainError })

  if (tenantDomain?.tenants) {
    const tenant = Array.isArray(tenantDomain.tenants) ? tenantDomain.tenants[0] : tenantDomain.tenants
    console.log('✅ [SITE] Found tenant via tenant_domains:', tenant)
    return { id: tenant.id, slug: tenant.slug, name: tenant.name }
  }

  // Fallback: try to find site by domain and get tenant from there
  console.log('🔍 [SITE] Checking sites table...')
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id, tenant_id, slug, primary_domain, tenants!inner(id, slug, name)')
    .eq('primary_domain', domain)
    .maybeSingle()

  console.log('🔍 [SITE] sites result:', { site, error: siteError })

  if (site?.tenants) {
    const tenant = Array.isArray(site.tenants) ? site.tenants[0] : site.tenants
    console.log('✅ [SITE] Found tenant via sites:', tenant)
    return { id: tenant.id, slug: tenant.slug, name: tenant.name }
  }

  // Try custom domains
  console.log('🔍 [SITE] Checking site_domains table...')
  const { data: custom, error: customError } = await supabase
    .from('site_domains')
    .select('site_id, sites!inner(id, tenant_id, slug, tenants!inner(id, slug, name))')
    .eq('domain', domain)
    .maybeSingle()

  console.log('🔍 [SITE] site_domains result:', { custom, error: customError })

  if (custom?.sites && Array.isArray(custom.sites) && custom.sites.length > 0) {
    const site = custom.sites[0]
    if (site.tenants) {
      const tenant = Array.isArray(site.tenants) ? site.tenants[0] : site.tenants
      console.log('✅ [SITE] Found tenant via site_domains:', tenant)
      return { id: tenant.id, slug: tenant.slug, name: tenant.name }
    }
  }

  console.log('❌ [SITE] No tenant found for domain:', domain)
  return null
}

export default async function Page({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params

  console.log('🌐 [SITE] Resolving domain:', domain)
  console.log('🌐 [SITE] Timestamp:', new Date().toISOString())

  // Look up the tenant from domain
  const tenant = await getTenantByDomain(domain)

  if (!tenant) {
    console.error('❌ [SITE] No tenant found for domain:', domain)
    console.error('❌ [SITE] Available environment variables:', {
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'NOT SET',
      SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET'
    })
    redirect('/') // fallback to home
  }

  console.log('✅ [SITE] Found tenant:', tenant)
  console.log('✅ [SITE] Redirecting to:', `/sites/${tenant.slug}`)

  // Redirect to the correct site slug
  redirect(`/sites/${tenant.slug}`)
}

