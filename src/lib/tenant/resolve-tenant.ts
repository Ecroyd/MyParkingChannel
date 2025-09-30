import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'

type TenantLite = {
  id: string
  name: string
  slug: string
  timezone: string
  brand_primary: string | null
  brand_secondary: string | null
  brand_logo_url: string | null
  site_hero_title: string | null
  site_hero_subtitle: string | null
  primary_domain?: string | null
}

function stripPort(host: string | null): string {
  if (!host) return ''
  return host.replace(/:\d+$/, '')
}

export async function resolveTenantByHost(): Promise<TenantLite | null> {
  const headersList = await headers()
  const host = stripPort(headersList.get('host'))
  
  console.log('🔍 resolveTenantByHost: Starting with host:', host)
  
  if (!host) {
    console.log('❌ resolveTenantByHost: No host found')
    return null
  }

  const base = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN!
  console.log('🔍 resolveTenantByHost: Base domain:', base)
  
  const admin = await createAdminClient()

  // 1) Exact custom domain match
  console.log('🔍 resolveTenantByHost: Checking custom domain match for:', host)
  const { data: byDomain, error: dErr } = await admin
    .from('tenant_domains')
    .select('tenant_id, domain, is_primary, tenants!inner(id,name,slug,timezone,brand_primary,brand_secondary,brand_logo_url,site_hero_title,site_hero_subtitle)')
    .eq('domain', host)
    .limit(1)
    .maybeSingle()

  console.log('🔍 resolveTenantByHost: Custom domain query result:', { byDomain, dErr })

  if (byDomain && byDomain.tenants) {
    const t = byDomain.tenants as any
    console.log('✅ resolveTenantByHost: Found custom domain match:', t)
    return { ...t, primary_domain: byDomain.domain }
  }

  // 2) Preview subdomain: slug.baseDomain
  const maybeSub = host.endsWith(base) && host !== base
  console.log('🔍 resolveTenantByHost: Checking subdomain match:', { maybeSub, host, base })
  
  if (maybeSub) {
    const slug = host.replace(`.${base}`, '')
    console.log('🔍 resolveTenantByHost: Extracted slug:', slug)
    
    const { data: t, error: sErr } = await admin
      .from('tenants')
      .select('id,name,slug,timezone,brand_primary,brand_secondary,brand_logo_url,site_hero_title,site_hero_subtitle')
      .eq('slug', slug)
      .limit(1)
      .maybeSingle()
      
    console.log('🔍 resolveTenantByHost: Subdomain query result:', { t, sErr })
    
    if (t) {
      console.log('✅ resolveTenantByHost: Found subdomain match:', t)
      return { ...t, primary_domain: `${slug}.${base}` }
    }
  }

  console.log('❌ resolveTenantByHost: No tenant found')
  return null
}

