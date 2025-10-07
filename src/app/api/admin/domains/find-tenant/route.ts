import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const email = searchParams.get('email')
    
    if (!email) {
      return NextResponse.json({ error: 'email parameter is required' }, { status: 400 })
    }

    const supabase = await getServerSupabase()
    const adminClient = await createAdminClient()

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    // Find user by email
    const { data: targetUser, error: userError } = await adminClient
      .from('auth.users')
      .select('id, email')
      .eq('email', email)
      .single();
    
    if (userError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get user's tenants
    const { data: userTenants, error: tenantsError } = await adminClient
      .from('user_tenants')
      .select(`
        tenant_id,
        role,
        is_default,
        tenants (
          id,
          name,
          slug
        )
      `)
      .eq('user_id', targetUser.id)

    if (tenantsError) {
      return NextResponse.json({ error: tenantsError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      user: {
        id: targetUser.id,
        email: targetUser.email
      },
      tenants: userTenants || []
    })

  } catch (error: any) {
    console.error('Find tenant error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
