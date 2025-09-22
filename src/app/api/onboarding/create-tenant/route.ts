import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { name, slug, timezone } = await req.json()

  // 1) Build response first so cookie refreshes are attached to THIS response
  const res = NextResponse.json({ ok: true })

  // 2) SSR client (reads auth cookie)
  const supaSSR = createServerClient(
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

  const { data: { user }, error } = await supaSSR.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 3) Admin client (service role) bypasses RLS for first-tenant bootstrap
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 4) Create tenant + membership + domain in a transaction-ish sequence
  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name, slug, timezone })
    .select()
    .single()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 })

  const { error: mErr } = await admin
    .from('user_tenants')
    .insert({ user_id: user.id, tenant_id: tenant.id, role: 'owner' })
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 })

  const { error: dErr } = await admin
    .from('tenant_domains')
    .insert({
      tenant_id: tenant.id,
      domain: `${slug}.${process.env.APP_BASE_DOMAIN}`,
      is_primary: true,
    })
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 })

  return NextResponse.json({ tenant }, { headers: res.headers })
}
