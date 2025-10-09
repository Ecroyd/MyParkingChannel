import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('slug')
    
    if (!slug) {
      return NextResponse.json({ error: 'Slug parameter is required' }, { status: 400 })
    }

    const admin = await createAdminClient()
    
    console.log('🔍 Debug: Checking tenant slug:', slug)
    
    // Check if tenant exists
    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .select('id, slug, name, status')
      .eq('slug', slug)
      .maybeSingle()

    console.log('🔍 Tenant lookup:', { tenant, error: tenantError })

    if (!tenant) {
      return NextResponse.json({
        slug,
        found: false,
        message: 'Tenant not found'
      })
    }

    // Check tenant domains
    const { data: domains, error: domainsError } = await admin
      .from('tenant_domains')
      .select('domain, is_primary, verified')
      .eq('tenant_id', tenant.id)

    console.log('🔍 Tenant domains:', { domains, error: domainsError })

    // Check sites for this tenant
    const { data: sites, error: sitesError } = await admin
      .from('sites')
      .select('id, slug, primary_domain')
      .eq('tenant_id', tenant.id)

    console.log('🔍 Tenant sites:', { sites, error: sitesError })

    return NextResponse.json({
      slug,
      found: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status
      },
      domains: domains || [],
      sites: sites || [],
      errors: {
        tenantError,
        domainsError,
        sitesError
      }
    })

  } catch (error: any) {
    console.error('❌ Debug tenant API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
