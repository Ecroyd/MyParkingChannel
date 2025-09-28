import { resolveTenantByHost } from '@/lib/tenant/resolve-tenant'
import Link from 'next/link'

// Force dynamic rendering for this page since it requires database access
export const dynamic = 'force-dynamic'

export default async function Home() {
  const t = await resolveTenantByHost()
  const title = t?.site_hero_title ?? 'Airport Parking, made simple.'
  const sub = t?.site_hero_subtitle ?? 'Secure parking, clear pricing, easy check-in.'

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 grid md:grid-cols-2 gap-8">
      <div className="space-y-4">
        <h1 className="text-3xl md:text-4xl font-semibold leading-tight">{title}</h1>
        <p className="text-gray-600">{sub}</p>
        <div className="flex gap-3 pt-2">
          <Link href="/book" className="px-4 py-2 rounded-lg text-white" style={{ backgroundColor: 'var(--brand)' }}>Book now</Link>
          <Link href="/pricing" className="px-4 py-2 rounded-lg border">See pricing</Link>
        </div>
      </div>
      <div className="bg-white rounded-2xl border p-4 shadow-sm">
        {/* Booking widget placeholder */}
        <div className="text-sm text-gray-500">Booking widget (dates → quote → details → pay)</div>
        <div className="mt-3 grid gap-2">
          <input className="border rounded-lg px-3 py-2" placeholder="Drop-off date/time" />
          <input className="border rounded-lg px-3 py-2" placeholder="Pick-up date/time" />
          <button className="px-3 py-2 rounded-lg text-white" style={{ backgroundColor: 'var(--brand)' }}>Get Quote</button>
        </div>
      </div>
    </section>
  )
}

