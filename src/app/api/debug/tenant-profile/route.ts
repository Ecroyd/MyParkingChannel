import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenantId')
    
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId parameter is required' }, { status: 400 })
    }

    const admin = await createAdminClient()
    
    console.log('🔍 Debug: Checking tenant profile for tenantId:', tenantId)
    
    // Check tenant_public_profile
    const { data: profile, error: profileError } = await admin
      .from('tenant_public_profile')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    console.log('🔍 Tenant profile lookup:', { profile, error: profileError })

    // Check tenant status
    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .select('id, slug, name, status')
      .eq('id', tenantId)
      .maybeSingle()

    console.log('🔍 Tenant lookup:', { tenant, error: tenantError })

    return NextResponse.json({
      tenantId,
      tenant: tenant || null,
      profile: profile || null,
      errors: {
        tenantError,
        profileError
      },
      isPublished: tenant?.status === 'active' && (profile?.is_active === true || profile?.status === 'active')
    })

  } catch (error: any) {
    console.error('❌ Debug tenant profile API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
