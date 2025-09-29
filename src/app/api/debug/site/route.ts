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

    // 1) domain → tenant
    const { data: domainRow } = await sb
      .from('tenant_domains')
      .select('tenant_id, domain, enabled, verified_at')
      .eq('domain', host)
      .maybeSingle()

    // 2) tenant core row
    let tenant: any = null
    if (domainRow?.tenant_id) {
      const { data } = await sb
        .from('tenants')
        .select('id, slug, name, site_published, created_at')
        .eq('id', domainRow.tenant_id)
        .maybeSingle()
      tenant = data
    }

    // 3) if slug provided, fetch by slug too (path-based sites)
    let tenantBySlug: any = null
    if (slug) {
      const { data } = await sb
        .from('tenants')
        .select('id, slug, name, site_published, created_at')
        .eq('slug', slug)
        .maybeSingle()
      tenantBySlug = data
    }

    return NextResponse.json({
      host,
      slug,
      domainRow,
      tenant,
      tenantBySlug,
      note: 'site_published is the flag that gates rendering. Ensure this is true for the resolved tenant.',
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'unknown' },
      { status: 500 }
    )
  }
}
