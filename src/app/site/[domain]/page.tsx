import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import BookingWidget from '@/components/booking/BookingWidget'

export default async function SitePage({ params }: { params: Promise<{ domain: string }>}) {
  const { domain } = await params
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

  // Resolve site by domain (primary or custom)
  const { data: site } = await supabase
    .from('sites')
    .select('id, tenant_id, slug, primary_domain')
    .eq('primary_domain', domain)
    .maybeSingle()

  if (!site) {
    // try custom domains
    const { data: custom } = await supabase
      .from('site_domains')
      .select('site_id, sites( id, tenant_id, slug, primary_domain )')
      .eq('domain', domain)
      .maybeSingle()
    if (!custom?.sites) return <div className="p-10">Site not found</div>
    // Create a new site object from custom.sites (it's an array, take the first one)
    const customSite = Array.isArray(custom.sites) ? custom.sites[0] : custom.sites
    return (
      <main className="max-w-3xl mx-auto py-10 space-y-6">
        <section className="card">
          <h1 className="text-2xl font-semibold mb-2">Welcome to {customSite.slug}</h1>
          <p className="text-fg/70">Book your parking below.</p>
        </section>
        <BookingWidget tenantSlug={customSite.slug} tenantId={customSite.tenant_id} />
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto py-10 space-y-6">
      <section className="card">
        <h1 className="text-2xl font-semibold mb-2">Welcome to {site.slug}</h1>
        <p className="text-fg/70">Book your parking below.</p>
      </section>

      {/* Inline widget version */}
      <BookingWidget tenantSlug={site.slug} tenantId={site.tenant_id} />
    </main>
  )
}

