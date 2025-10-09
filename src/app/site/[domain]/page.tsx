// src/app/site/[domain]/page.tsx
import { redirect } from 'next/navigation'

async function getTenantByDomain(domain: string) {
  console.log('🔍 [SITE] Starting domain lookup for:', domain)
  console.log('🔍 [SITE] Domain type:', typeof domain)
  console.log('🔍 [SITE] Domain length:', domain?.length)
  
  // For now, let's use a simple approach - hardcode the known tenant
  // This is a temporary fix while we debug the admin client issue
  if (domain === 'parkingexeterairport.co.uk') {
    console.log('✅ [SITE] Using hardcoded tenant for parkingexeterairport.co.uk')
    return { 
      id: 'bab45dab-19e8-4230-b18e-ee1f663608e5', 
      slug: 'flyparksexeter', 
      name: 'Fly Parks Exeter' 
    }
  }
  
  // Also handle the case where domain might be the full URL
  if (domain && domain.includes('parkingexeterairport.co.uk')) {
    console.log('✅ [SITE] Using hardcoded tenant for domain containing parkingexeterairport.co.uk')
    return { 
      id: 'bab45dab-19e8-4230-b18e-ee1f663608e5', 
      slug: 'flyparksexeter', 
      name: 'Fly Parks Exeter' 
    }
  }
  
  console.log('❌ [SITE] Domain does not match hardcoded fallback:', domain)
  
  // Try admin client for other domains
  try {
    const { createAdminClient } = await import('@/lib/supabase/server-admin')
    const supabase = createAdminClient()
    
    console.log('🔍 [SITE] Admin client created successfully')

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
  } catch (error) {
    console.error('❌ [SITE] Admin client error:', error)
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
    console.error('❌ [SITE] This should not happen with hardcoded fallback')
    redirect('/') // fallback to home
  }

  console.log('✅ [SITE] Found tenant:', tenant)
  console.log('✅ [SITE] Redirecting to:', `/sites/${tenant.slug}`)

  // Redirect to the correct site slug
  redirect(`/sites/${tenant.slug}`)
}

