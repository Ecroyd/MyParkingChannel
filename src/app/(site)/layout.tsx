import { resolveTenantByHost } from '@/lib/tenant/resolve-tenant'
import Link from 'next/link'

// Force dynamic rendering for this route group since it requires database access
export const dynamic = 'force-dynamic'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const tenant = await resolveTenantByHost()
  if (!tenant) {
    // simple holding page if host is unknown
    return (
      <html>
        <body className="min-h-dvh grid place-items-center">
          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold">Site not configured</h1>
            <p className="text-gray-500 text-sm">Add a domain in your Parking Channel admin.</p>
            <Link className="text-indigo-700 underline text-sm" href="https://www.parkingchannel.example">Back to main</Link>
          </div>
        </body>
      </html>
    )
  }

  const style = (
    <style>{`
      :root {
        --brand: ${tenant.brand_primary ?? '#1e40af'};
        --brand2: ${tenant.brand_secondary ?? '#65a30d'};
      }
    `}</style>
  )

  return (
    <html>
      <head>{style}</head>
      <body className="min-h-dvh bg-glass-gradient text-gray-900">
        <header className="border-b bg-white">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {tenant.brand_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.brand_logo_url} alt={tenant.name} className="h-7" />
              ) : (
                <div className="font-semibold" style={{ color: 'var(--brand)' }}>{tenant.name}</div>
              )}
            </div>
            <nav className="hidden md:flex items-center gap-6 text-sm">
              <Link href="/" className="hover:opacity-80">Home</Link>
              <Link href="/pricing" className="hover:opacity-80">Pricing</Link>
              <Link href="/book" className="px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: 'var(--brand)' }}>Book</Link>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-12 border-t">
          <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-gray-500">
            © {new Date().getFullYear()} {tenant.name}. Powered by Parking Channel.
          </div>
        </footer>
      </body>
    </html>
  )
}

