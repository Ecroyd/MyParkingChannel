import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'

export async function POST(req: NextRequest) {
  try {
    const { domain, tenant_id } = await req.json()
    
    if (!domain || !tenant_id) {
      return NextResponse.json({ error: 'domain and tenant_id are required' }, { status: 400 })
    }

    const supabase = await getServerSupabase()
    const adminClient = await createAdminClient()

    // Verify user has access to this tenant
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const { data: userTenant, error: accessError } = await supabase
      .from('user_tenants')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (accessError || !userTenant) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if domain already exists
    const { data: existingDomain } = await adminClient
      .from('tenant_domains')
      .select('domain')
      .eq('domain', domain)
      .maybeSingle()

    if (existingDomain) {
      return NextResponse.json({ error: 'Domain already exists' }, { status: 409 })
    }

    // Add domain to tenant_domains table
    const { data, error } = await adminClient
      .from('tenant_domains')
      .insert({
        tenant_id,
        domain,
        is_primary: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding domain:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      domain: data,
      message: `Domain ${domain} successfully added to tenant`
    })

  } catch (error: any) {
    console.error('Add domain error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
