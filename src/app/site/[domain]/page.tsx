import { redirect } from 'next/navigation'
import { getTenantByDomain } from '@/lib/tenants/server'

export default async function SiteEntry({ params }: { params: { domain: string } }) {
  // Get domain from the URL
  const domain = params.domain

  // Look up tenant by domain
  const tenant = await getTenantByDomain(domain)

  if (!tenant) {
    console.error('❌ No tenant found for domain:', domain)
    redirect('/')
  }

  // ✅ Found tenant → redirect to correct site
  const slug = tenant.slug
  redirect(`/sites/${slug}`)
}

