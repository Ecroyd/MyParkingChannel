import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { domain, tenantSlug } = await req.json()
    
    if (!domain || !tenantSlug) {
      return NextResponse.json({ 
        error: 'domain and tenantSlug parameters are required' 
      }, { status: 400 })
    }

    const admin = await createAdminClient()
    
    console.log('🔧 Debug: Adding domain to tenant:', { domain, tenantSlug })
    
    // First, find the tenant by slug
    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .select('id, slug, name')
      .eq('slug', tenantSlug)
      .maybeSingle()

    if (tenantError) {
      console.error('❌ Error finding tenant:', tenantError)
      return NextResponse.json({ error: `Error finding tenant: ${tenantError.message}` }, { status: 500 })
    }

    if (!tenant) {
      return NextResponse.json({ 
        error: `Tenant with slug '${tenantSlug}' not found` 
      }, { status: 404 })
    }

    console.log('✅ Found tenant:', tenant)

    // Check if domain already exists
    const { data: existingDomain } = await admin
      .from('tenant_domains')
      .select('domain, tenant_id')
      .eq('domain', domain)
      .maybeSingle()

    if (existingDomain) {
      return NextResponse.json({ 
        error: `Domain '${domain}' already exists for tenant ${existingDomain.tenant_id}` 
      }, { status: 409 })
    }

    // Add domain to tenant_domains table
    const { data: newDomain, error: addError } = await admin
      .from('tenant_domains')
      .insert({
        tenant_id: tenant.id,
        domain,
        is_primary: false,
        verified: true // Set as verified for debugging
      })
      .select()
      .single()

    if (addError) {
      console.error('❌ Error adding domain:', addError)
      return NextResponse.json({ error: `Error adding domain: ${addError.message}` }, { status: 500 })
    }

    console.log('✅ Domain added successfully:', newDomain)

    return NextResponse.json({
      success: true,
      message: `Domain '${domain}' successfully added to tenant '${tenant.name}' (${tenant.slug})`,
      domain: newDomain,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name
      }
    })

  } catch (error: any) {
    console.error('❌ Debug add-domain API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
