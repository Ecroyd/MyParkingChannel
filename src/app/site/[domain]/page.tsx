// src/app/site/[domain]/page.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getTenantByDomain(domain: string) {
  const cookieStore = await cookies()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )

  // First try to find tenant by domain in tenant_domains table
  const { data: tenantDomain } = await supabase
    .from('tenant_domains')
    .select('tenant_id, tenants!inner(id, slug, name)')
    .eq('domain', domain)
    .maybeSingle()

  if (tenantDomain?.tenants) {
    const tenant = Array.isArray(tenantDomain.tenants) ? tenantDomain.tenants[0] : tenantDomain.tenants
    return { id: tenant.id, slug: tenant.slug, name: tenant.name }
  }

  // Fallback: try to find site by domain and get tenant from there
  const { data: site } = await supabase
    .from('sites')
    .select('id, tenant_id, slug, primary_domain, tenants!inner(id, slug, name)')
    .eq('primary_domain', domain)
    .maybeSingle()

  if (site?.tenants) {
    const tenant = Array.isArray(site.tenants) ? site.tenants[0] : site.tenants
    return { id: tenant.id, slug: tenant.slug, name: tenant.name }
  }

  // Try custom domains
  const { data: custom } = await supabase
    .from('site_domains')
    .select('site_id, sites!inner(id, tenant_id, slug, tenants!inner(id, slug, name))')
    .eq('domain', domain)
    .maybeSingle()

  if (custom?.sites && Array.isArray(custom.sites) && custom.sites.length > 0) {
    const site = custom.sites[0]
    if (site.tenants) {
      const tenant = Array.isArray(site.tenants) ? site.tenants[0] : site.tenants
      return { id: tenant.id, slug: tenant.slug, name: tenant.name }
    }
  }

  return null
}

export default async function Page({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params

  console.log('🌐 Resolving domain:', domain)

  // Look up the tenant from domain
  const tenant = await getTenantByDomain(domain)

  if (!tenant) {
    console.error('❌ No tenant found for domain:', domain)
    redirect('/') // fallback to home
  }

  console.log('✅ Found tenant:', tenant)
  console.log('✅ Redirecting to:', `/sites/${tenant.slug}`)

  // Redirect to the correct site slug
  redirect(`/sites/${tenant.slug}`)
}

