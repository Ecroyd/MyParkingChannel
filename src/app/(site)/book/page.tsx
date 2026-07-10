import { resolveTenantByHost } from '@/lib/tenant/resolve-tenant'

export default async function BookPage() {
  const t = await resolveTenantByHost()
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 space-y-4">
      <h1 className="text-2xl font-semibold">Book parking</h1>
      <p className="text-sm text-gray-500">You're booking with <b>{t?.name}</b>.</p>
      {/* Replace this with your real booking flow */}
      <div className="bg-white border rounded-2xl p-4 shadow-sm">
        <div className="grid md:grid-cols-2 gap-3">
          <input className="border rounded-lg px-3 py-2" placeholder="Drop-off date/time" />
          <input className="border rounded-lg px-3 py-2" placeholder="Pick-up date/time" />
          <input className="border rounded-lg px-3 py-2 md:col-span-2" placeholder="Name & Email" />
          <button className="px-3 py-2 rounded-lg text-white md:col-span-2" style={{ backgroundColor: 'var(--brand)' }}>Continue</button>
        </div>
      </div>
    </section>
  )
}

