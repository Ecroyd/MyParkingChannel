import { resolveTenantByHost } from '@/lib/tenant/resolve-tenant'
import Link from 'next/link'

export default async function Pricing() {
  const t = await resolveTenantByHost()
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 space-y-6">
      <h1 className="text-2xl font-semibold">Pricing</h1>
      <p className="text-gray-600 text-sm">Final price shown at checkout. All bookings include shuttle transfers.</p>
      <div className="grid md:grid-cols-3 gap-4">
        {['1–3 days','4–7 days','8+ days'].map((tier,i)=>(
          <div key={i} className="bg-white rounded-2xl border p-5 shadow-sm">
            <div className="text-sm text-gray-500">{tier}</div>
            <div className="text-2xl font-semibold mt-1">From £{i===0?29:i===1?49:79}</div>
            <ul className="mt-3 text-sm text-gray-600 list-disc pl-5 space-y-1">
              <li>Secure gated car park</li>
              <li>24/7 CCTV</li>
              <li>Free shuttle bus</li>
            </ul>
            <Link href="/book" className="inline-block mt-4 px-3 py-2 rounded-lg text-white" style={{ backgroundColor: 'var(--brand)' }}>Book</Link>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500">Timezone: {t?.timezone}</div>
    </section>
  )
}

