import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await req.json()
    
    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
    }

    const admin = await createAdminClient()
    
    console.log('🔍 Creating tenant_public_profile for tenantId:', tenantId)
    
    // Check if profile already exists
    const { data: existingProfile } = await admin
      .from('tenant_public_profile')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (existingProfile) {
      return NextResponse.json({
        success: true,
        message: 'Profile already exists',
        profile: existingProfile
      })
    }

    // Create the missing profile
    const { data: profile, error: profileError } = await admin
      .from('tenant_public_profile')
      .insert({
        tenant_id: tenantId,
        is_active: true,
        status: 'active'
      })
      .select()
      .single()

    if (profileError) {
      console.error('❌ Error creating profile:', profileError)
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    console.log('✅ Created tenant_public_profile:', profile)

    return NextResponse.json({
      success: true,
      message: 'Tenant profile created successfully',
      profile
    })

  } catch (error: any) {
    console.error('❌ Create tenant profile API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
