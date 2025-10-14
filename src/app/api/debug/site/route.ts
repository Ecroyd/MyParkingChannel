export const runtime = 'nodejs'; // <— forces Node, so supabase-js is allowed

import { NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  if (process.env.NEXT_PUBLIC_DEBUG_SITE !== '1') {
    return new NextResponse('Not Found', { status: 404 })
  }

  try {
    const url = new URL(req.url)
    const host = req.headers.get('host') || ''
    const slug = url.searchParams.get('slug') || undefined
    const sb = createAdminClient()

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

    // Get profile for the resolved tenant
    let profile: any = null
    const resolvedTenant = tenant || tenantBySlug
    if (resolvedTenant?.id) {
      try {
        const { data } = await sb
          .from('tenant_public_profile')
          .select('is_active, status, updated_at')
          .eq('tenant_id', resolvedTenant.id)
          .maybeSingle()
        profile = data
      } catch {}
    }

    return NextResponse.json({
      host,
      slug,
      tenant: resolvedTenant ? { id: resolvedTenant.id, slug: resolvedTenant.slug, status: resolvedTenant.status } : null,
      profile: profile ? { is_active: profile.is_active, status: profile.status, updated_at: profile.updated_at } : null,
      derivedPublished: resolvedTenant?.status === 'active' && (profile?.is_active || profile?.status === 'active'),
      note: 'Tenant needs status=active AND profile.is_active=true (or status=active)'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'unknown' }, { status: 500 })
  }
}
