import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { headers, cookies } from 'next/headers'

type Out = { tenant_id: string | null; slug: string | null; source: string }

export async function GET(req: Request) {
  const h = await headers()
  const cookieStore = await cookies()
  const url = new URL(req.url)

  // 1) Explicit overrides (handy in admin): ?tenant=slug-or-uuid
  const qsTenant = url.searchParams.get('tenant') ?? null

  // 2) Cookie remember (set once user picks a tenant in admin)
  const cookieSlug = cookieStore.get('tenant_slug')?.value ?? null

  // 3) Domain → tenant_domains
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').toLowerCase()

  const supabase = getServerSupabase()

  // Helper: find tenant by slug or id
  async function bySlugOrId(key: string) {
    // Try UUID then slug
    const { data: byId } = await supabase.from('tenants').select('id,slug').eq('id', key).maybeSingle()
    if (byId?.id) return byId
    const { data: bySlug } = await supabase.from('tenants').select('id,slug').eq('slug', key).maybeSingle()
    return bySlug ?? null
  }

  // Try querystring → cookie → domain
  let resolved: { id: string; slug: string } | null = null
  let source: string = 'unknown'

  if (qsTenant) {
    const r = await bySlugOrId(qsTenant)
    if (r) { resolved = { id: r.id, slug: r.slug }; source = 'query' }
  }

  if (!resolved && cookieSlug) {
    const r = await bySlugOrId(cookieSlug)
    if (r) { resolved = { id: r.id, slug: r.slug }; source = 'cookie' }
  }

  if (!resolved && host) {
    // Exact domain match first
    const { data: dom } = await supabase
      .from('tenant_domains')
      .select('tenant_id')
      .eq('host', host)
      .maybeSingle()

    if (dom?.tenant_id) {
      const { data: t } = await supabase.from('tenants').select('id,slug').eq('id', dom.tenant_id).single()
      if (t) { resolved = { id: t.id, slug: t.slug }; source = 'domain' }
    } else {
      // If using subdomains like <slug>.myparkingchannel.app, extract leftmost
      const parts = host.split('.')
      if (parts.length >= 3) {
        const sub = parts[0]
        const { data: t } = await supabase.from('tenants').select('id,slug').eq('slug', sub).maybeSingle()
        if (t) { resolved = { id: t.id, slug: t.slug }; source = 'subdomain' }
      }
    }
  }

  // As a final fallback: if the authed user has exactly one tenant, pick it
  if (!resolved) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: me } = await supabase.from('user_tenants').select('tenant_id').eq('user_id', user.id).limit(2)
      if (me && me.length === 1) {
        const { data: t } = await supabase.from('tenants').select('id,slug').eq('id', me[0].tenant_id).single()
        if (t) { resolved = { id: t.id, slug: t.slug }; source = 'only-tenant' }
      }
    }
  }

  const out: Out = { tenant_id: resolved?.id ?? null, slug: resolved?.slug ?? null, source }
  return NextResponse.json(out, { status: resolved ? 200 : 404 })
}

