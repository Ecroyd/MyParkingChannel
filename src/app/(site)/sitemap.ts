import { resolveTenantByHost } from '@/lib/tenant/resolve-tenant'

// Force dynamic rendering for this route since it requires database access
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Prevent static generation of this route
export async function generateStaticParams() {
  return []
}

export default async function sitemap() {
  const t = await resolveTenantByHost()
  if (!t) return []
  const base = t.primary_domain ?? `${t.slug}.${process.env.NEXT_PUBLIC_APP_BASE_DOMAIN!}`
  const origin = base.startsWith('http') ? base : `https://${base}`
  const lastmod = new Date().toISOString()

  return [
    { url: `${origin}/`, lastModified: lastmod },
    { url: `${origin}/pricing`, lastModified: lastmod },
    { url: `${origin}/book`, lastModified: lastmod },
  ]
}
