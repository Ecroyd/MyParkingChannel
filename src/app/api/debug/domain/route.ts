import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const domain = searchParams.get('domain')
    
    if (!domain) {
      return NextResponse.json({ error: 'Domain parameter is required' }, { status: 400 })
    }

    const admin = await createAdminClient()
    
    console.log('🔍 Debug: Checking domain:', domain)
    
    // Check tenant_domains table
    const { data: tenantDomain, error: tenantDomainError } = await admin
      .from('tenant_domains')
      .select('tenant_id, domain, is_primary, tenants!inner(id, slug, name)')
      .eq('domain', domain)
      .maybeSingle()

    console.log('🔍 Tenant domain lookup:', { tenantDomain, error: tenantDomainError })

    // Check sites table
    const { data: site, error: siteError } = await admin
      .from('sites')
      .select('id, tenant_id, slug, primary_domain, tenants!inner(id, slug, name)')
      .eq('primary_domain', domain)
      .maybeSingle()

    console.log('🔍 Site lookup:', { site, error: siteError })

    // Check site_domains table
    const { data: customDomain, error: customDomainError } = await admin
      .from('site_domains')
      .select('site_id, sites!inner(id, tenant_id, slug, tenants!inner(id, slug, name))')
      .eq('domain', domain)
      .maybeSingle()

    console.log('🔍 Custom domain lookup:', { customDomain, error: customDomainError })

    return NextResponse.json({
      domain,
      tenantDomain: tenantDomain ? {
        tenant_id: tenantDomain.tenant_id,
        domain: tenantDomain.domain,
        is_primary: tenantDomain.is_primary,
        tenant: tenantDomain.tenants
      } : null,
      site: site ? {
        id: site.id,
        tenant_id: site.tenant_id,
        slug: site.slug,
        primary_domain: site.primary_domain,
        tenant: site.tenants
      } : null,
      customDomain: customDomain ? {
        site_id: customDomain.site_id,
        site: customDomain.sites
      } : null,
      errors: {
        tenantDomainError,
        siteError,
        customDomainError
      }
    })

  } catch (error: any) {
    console.error('❌ Debug domain API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
