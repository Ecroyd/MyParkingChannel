import { resolveTenantByHost } from '@/lib/tenant/resolve-tenant';
import LandingPageClient from './LandingPageClient';

// Force dynamic rendering for this page since it requires database access
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  // Check if there's a tenant that should be shown on the base domain
  const tenant = await resolveTenantByHost();
  
  if (tenant) {
    // If there's a tenant for this domain, redirect to their site
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-semibold">Redirecting to {tenant.name}...</h1>
          <p className="text-gray-600">Please wait while we redirect you to the correct site.</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  // No tenant found, show the main landing page
  return <LandingPageClient />;
}
