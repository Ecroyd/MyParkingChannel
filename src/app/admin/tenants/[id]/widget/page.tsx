/**
 * Widget Snippet Page
 * Shows the embeddable booking widget code for a tenant
 */

import { requirePlatformAdmin } from '@/lib/guards';
import WidgetSnippet from '../../WidgetSnippet';

// Force dynamic rendering for this page since it requires authentication
export const dynamic = 'force-dynamic';

export default async function TenantWidgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb } = await requirePlatformAdmin();

  // Fetch tenant data
  const { data: tenant, error: tenantError } = await sb
    .from('tenants')
    .select('id, name, slug')
    .eq('id', id)
    .single();

  if (tenantError || !tenant) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Tenant Not Found</h1>
          <p className="text-gray-600">The tenant you're looking for doesn't exist or you don't have permission to view it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Booking Widget</h1>
        <p className="text-gray-600 mt-1">
          Embed the booking widget for <strong>{tenant.name}</strong> on any website
        </p>
      </div>
      
      <WidgetSnippet tenantSlug={tenant.slug} tenantName={tenant.name} />
    </div>
  );
}
