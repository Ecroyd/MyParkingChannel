import { resolveTenantByHost } from '@/lib/tenant/resolve-tenant';
import LandingPageClient from './LandingPageClient';
import { redirect } from 'next/navigation';

// Force dynamic rendering for this page since it requires database access
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  // Check if there's a tenant that should be shown on the base domain
  const tenant = await resolveTenantByHost();
  
  if (tenant) {
    // If there's a tenant for this domain, redirect to their site
    redirect(`/sites/${tenant.slug}`);
  }

  // No tenant found, show the main landing page
  return <LandingPageClient />;
}
