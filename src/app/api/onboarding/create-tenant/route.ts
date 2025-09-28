import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    console.log('🚀 Create-tenant API: Starting tenant creation...')
    const { name, slug, timezone } = await req.json()
    console.log('📊 Create-tenant API: Request data:', { name, slug, timezone })

    // 1) Build response first so cookie refreshes are attached to THIS response
    const res = NextResponse.json({ ok: true })

    // 2) SSR client (reads auth cookie)
    const supaSSR = await getServerSupabase()

    console.log('🔍 Create-tenant API: Checking user authentication...')
    const { data: { user }, error } = await supaSSR.auth.getUser()
    if (!user) {
      console.log('❌ Create-tenant API: User not authenticated')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('✅ Create-tenant API: User authenticated:', user.id, user.email)

    // 3) Admin client (service role) bypasses RLS for first-tenant bootstrap
    console.log('🔧 Create-tenant API: Creating admin client...')
    const admin = await createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 4) Create tenant + membership + domain in a transaction-ish sequence
    console.log('🏢 Create-tenant API: Creating tenant...')
    const { data: tenant, error: tErr } = await admin
      .from('tenants')
      .insert({ name, slug, timezone })
      .select()
      .single()
    
    if (tErr) {
      console.log('❌ Create-tenant API: Tenant creation failed:', tErr)
      return NextResponse.json({ error: tErr.message }, { status: 400 })
    }

    console.log('✅ Create-tenant API: Tenant created:', tenant.id, tenant.name)

    console.log('👤 Create-tenant API: Creating user_tenants relationship...')
    const { error: mErr } = await admin
      .from('user_tenants')
      .insert({ user_id: user.id, tenant_id: tenant.id, role: 'owner', is_default: true })
    
    if (mErr) {
      console.log('❌ Create-tenant API: User_tenants creation failed:', mErr)
      return NextResponse.json({ error: mErr.message }, { status: 400 })
    }

    console.log('✅ Create-tenant API: User_tenants relationship created')

    console.log('🌐 Create-tenant API: Creating tenant domain...')
    const { error: dErr } = await admin
      .from('tenant_domains')
      .insert({
        tenant_id: tenant.id,
        domain: `${slug}.${process.env.APP_BASE_DOMAIN}`,
        is_primary: true,
      })
    
    if (dErr) {
      console.log('❌ Create-tenant API: Domain creation failed:', dErr)
      return NextResponse.json({ error: dErr.message }, { status: 400 })
    }

    console.log('✅ Create-tenant API: Tenant creation completed successfully')
    return NextResponse.json({ tenant }, )

  } catch (err: any) {
    console.error('❌ Create-tenant API: Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

