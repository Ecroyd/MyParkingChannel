import type { MetadataRoute } from "next";
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

/**
 * Get branding by host → tenant lookup
 */
async function getBrandingByHost(host?: string) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )

  let tenant = null

  // Try domain mapping first
  if (host && !host.startsWith('localhost')) {
    const { data } = await supabase
      .from('tenant_domains')
      .select('tenants!inner(id, name, slug)')
      .eq('domain', host)
      .limit(1)
      .maybeSingle()
    if (data?.tenants) tenant = data.tenants as any
  }

  // Fallback to first tenant (for localhost/dev)
  if (!tenant) {
    const { data } = await supabase
      .from('tenants')
      .select('id, name, slug')
      .limit(1)
      .maybeSingle()
    if (data) tenant = data
  }

  // Get branding for the tenant
  if (tenant) {
    const { data: branding } = await supabase
      .from('tenant_branding')
      .select('*')
      .eq('tenant_id', tenant.id)
      .single()

    if (branding) {
      return {
        app_name: branding.app_name,
        short_name: branding.short_name,
        theme_color: branding.theme_color,
        background_color: branding.background_color,
        start_url: branding.start_url,
        icon_192_url: branding.icon_192_url || "/parking favicon.png",
        icon_512_url: branding.icon_512_url || "/parking favicon.png",
        maskable_512_url: branding.maskable_512_url || "/parking favicon.png"
      }
    }
  }

  // Default fallback
  return {
    app_name: "Parking Channel",
    short_name: "Parking",
    theme_color: "#0B0B0B",
    background_color: "#FFFFFF",
    start_url: "/",
    icon_192_url: "/parking favicon.png",
    icon_512_url: "/parking favicon.png",
    maskable_512_url: "/parking favicon.png"
  };
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get("host") ?? undefined
  const b = await getBrandingByHost(host);

  return {
    name: b.app_name,
    short_name: b.short_name,
    start_url: b.start_url,
    scope: "/",
    display: "standalone",
    background_color: b.background_color,
    theme_color: b.theme_color,
    icons: [
      { src: b.icon_192_url, sizes: "192x192", type: "image/png" },
      { src: b.icon_512_url, sizes: "512x512", type: "image/png" },
      { src: b.maskable_512_url, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ],
    shortcuts: [
      { name: "Bookings", url: "/admin/bookings", icons: [{ src: b.icon_192_url, sizes: "192x192", type: "image/png" }] },
      { name: "Today", url: "/admin/today", icons: [{ src: b.icon_192_url, sizes: "192x192", type: "image/png" }] }
    ],
    id: "/",
    lang: "en-GB",
    categories: ["business", "productivity"]
  };
}

