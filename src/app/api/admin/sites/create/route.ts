import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase/server'
import { siteDomainForTenantSlug } from '@/lib/sites/domain'

export async function POST(req: NextRequest) {
  const { tenant_id, template = 'default' } = await req.json().catch(() => ({}))
  if (!tenant_id) return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })

  const supabase = await getServerSupabase()

  // Ensure caller is a member of this tenant
  const { data: me } = await supabase.auth.getUser()
  if (!me?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { data: member } = await supabase
    .from('user_tenants')
    .select('tenant_id, role')
    .eq('tenant_id', tenant_id)
    .eq('user_id', me.user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get tenant slug
  const { data: tenant, error: terr } = await supabase
    .from('tenants').select('id, slug').eq('id', tenant_id).single()
  if (terr) return NextResponse.json({ error: terr.message }, { status: 500 })

  const primaryDomain = siteDomainForTenantSlug(tenant.slug)

  // Upsert site
  const { data: site, error: serr } = await supabase
    .from('sites')
    .upsert({
      tenant_id,
      slug: tenant.slug,
      primary_domain: primaryDomain,
      template,
      status: 'ready',
    }, { onConflict: 'tenant_id' })
    .select('id')
    .single()
  if (serr) return NextResponse.json({ error: serr.message }, { status: 500 })

  // Ensure primary domain record
  await supabase.from('site_domains').upsert({
    site_id: site.id,
    domain: primaryDomain,
    is_primary: true,
  }, { onConflict: 'domain' })

  // Seed a simple home page if missing
  await supabase.from('site_pages').upsert({
    site_id: site.id,
    path: '/',
    title: 'Welcome',
    content_md: `# Welcome\nBook your secure airport parking below.\n\n`,
  }, { onConflict: 'site_id, path' })

  return NextResponse.json({ ok: true, site_id: site.id, url: `https://${primaryDomain}` })
}


