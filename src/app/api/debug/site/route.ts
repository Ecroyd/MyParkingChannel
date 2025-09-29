export const runtime = 'nodejs'; // <— forces Node, so supabase-js is allowed

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  if (process.env.NEXT_PUBLIC_DEBUG_SITE !== '1') {
    return new NextResponse('Not Found', { status: 404 })
  }

  try {
    const url = new URL(req.url)
    const host = req.headers.get('host') || ''
    const slug = url.searchParams.get('slug') || undefined
    const sb = await createServerClient({ admin: true })

    // Keep selects broad so we can *see* what exists, but ONLY for known tables
    const { data: domainRow } = await sb
      .from('tenant_domains')
      .select('*')
      .eq('domain', host)
      .maybeSingle()

    let tenant: any = null
    if (domainRow?.tenant_id) {
      const { data } = await sb
        .from('tenants')
        .select('*')
        .eq('id', domainRow.tenant_id)
        .maybeSingle()
      tenant = data
    }

    let tenantBySlug: any = null
    if (slug) {
      const { data } = await sb
        .from('tenants')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()
      tenantBySlug = data
    }

    // optional: try tenant_public_profile only if it exists in your schema
    let profile: any = null
    try {
      const tid = tenant?.id ?? tenantBySlug?.id
      if (tid) {
        const { data } = await sb
          .from('tenant_public_profile')
          .select('*')
          .eq('tenant_id', tid)
          .maybeSingle()
        profile = data
      }
    } catch {}

    return NextResponse.json({
      host,
      slug,
      domainRow,
      tenant,
      tenantBySlug,
      profile,
      hint: 'Find the real publish flag in these rows (e.g. enabled, is_live, status, published_at, etc.)'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
