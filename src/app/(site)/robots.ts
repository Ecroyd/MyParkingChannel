import { resolveTenantByHost } from '@/lib/tenant/resolve-tenant'

export default async function robots() {
  const t = await resolveTenantByHost()
  const base = t
    ? (t.primary_domain ?? `${t.slug}.${process.env.NEXT_PUBLIC_APP_BASE_DOMAIN!}`)
    : process.env.NEXT_PUBLIC_APP_BASE_DOMAIN!

  const host = base.startsWith('http') ? base : `https://${base}`

  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${host}/sitemap.xml`,
    host,
  }
}

