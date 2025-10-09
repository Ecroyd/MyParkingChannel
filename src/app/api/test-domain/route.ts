import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const domain = searchParams.get('domain')
    
    if (!domain) {
      return NextResponse.json({ error: 'Domain parameter is required' }, { status: 400 })
    }

    console.log('🔍 Test: Checking domain:', domain)
    
    const admin = await createAdminClient()
    
    // Check tenant_domains table
    const { data: tenantDomain, error: tenantDomainError } = await admin
      .from('tenant_domains')
      .select('tenant_id, domain, is_primary, tenants!inner(id, slug, name, status)')
      .eq('domain', domain)
      .maybeSingle()

    console.log('🔍 Tenant domain lookup:', { tenantDomain, error: tenantDomainError })

    if (!tenantDomain?.tenants) {
      return NextResponse.json({
        domain,
        found: false,
        message: 'Domain not found in tenant_domains table',
        suggestion: 'Add domain to tenant_domains table'
      })
    }

    // Check tenant_public_profile
    const { data: profile, error: profileError } = await admin
      .from('tenant_public_profile')
      .select('is_active, status')
      .eq('tenant_id', tenantDomain.tenant_id)
      .maybeSingle()

    console.log('🔍 Profile lookup:', { profile, error: profileError })

    const isPublished = 
      tenantDomain.tenants.status === 'active' && 
      (profile?.is_active === true || profile?.status === 'active')

    return NextResponse.json({
      domain,
      found: true,
      tenant: {
        id: tenantDomain.tenants.id,
        slug: tenantDomain.tenants.slug,
        name: tenantDomain.tenants.name,
        status: tenantDomain.tenants.status
      },
      profile: profile ? {
        is_active: profile.is_active,
        status: profile.status
      } : null,
      isPublished,
      message: isPublished 
        ? 'Domain should work - tenant is published' 
        : 'Domain configured but tenant not published - needs tenant_public_profile'
    })

  } catch (error: any) {
    console.error('❌ Test domain API error:', error)
    return NextResponse.json({ 
      error: error.message,
      suggestion: 'Check database connection and configuration'
    }, { status: 500 })
  }
}
