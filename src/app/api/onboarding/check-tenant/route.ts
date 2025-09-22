import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(req: NextRequest) {
  // Build response first
  const res = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => req.cookies.get(n)?.value,
        set: (n, v, o) => res.cookies.set({ name: n, value: v, ...o }),
        remove: (n, o) => res.cookies.set({ name: n, value: '', ...o }),
      },
    }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user already has a tenant
  const { data: userTenant, error: tenantError } = await supabase
    .from('user_tenants')
    .select(`
      tenant_id,
      role,
      tenants (
        id,
        name,
        slug,
        timezone
      )
    `)
    .eq('user_id', user.id)
    .single()

  if (tenantError && tenantError.code !== 'PGRST116') {
    return NextResponse.json({ error: tenantError.message }, { status: 400 })
  }

  return NextResponse.json({ 
    hasTenant: !!userTenant,
    tenant: userTenant?.tenants || null,
    role: userTenant?.role || null
  }, { headers: res.headers })
}

