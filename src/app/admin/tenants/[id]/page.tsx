import { requirePlatformAdmin } from '@/lib/guards';
import TenantDetailClient from './TenantDetailClient';

// Force dynamic rendering for this page since it requires authentication
export const dynamic = 'force-dynamic';

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { adminClient } = await requirePlatformAdmin();
  const { id } = await params;

  // Fetch tenant details with owner information
  console.log('Fetching tenant details for ID:', id);
  const { data: tenant, error } = await adminClient
    .from('tenants')
    .select('id, name, slug, created_at')
    .eq('id', id)
    .single();

  console.log('Tenant query result:', { tenant, error });

  if (error || !tenant) {
    console.error('Tenant not found:', {
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      code: error?.code,
      tenant
    });
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-red-600">Tenant not found</h1>
        <p className="text-gray-600 mt-2">The requested tenant could not be found.</p>
        <p className="text-sm text-gray-500 mt-1">Error: {error?.message || 'Unknown error'}</p>
      </div>
    );
  }

  // Fetch user_tenants relationships
  const { data: userTenants, error: userTenantsError } = await adminClient
    .from('user_tenants')
    .select(`
      user_id,
      role
    `)
    .eq('tenant_id', id);

  console.log('User tenants query result:', { userTenants, userTenantsError });

  // Get owner information if exists
  let ownerInfo = null;
  if (userTenants && userTenants.length > 0) {
    const owner = userTenants.find(ut => ut.role === 'owner');
    if (owner) {
      // Try to get user info from auth.users via RPC
      try {
        const { data: ownerData, error: ownerError } = await adminClient.rpc('get_user_contact_info', { p_user_id: owner.user_id });
        if (!ownerError && ownerData && ownerData.length > 0) {
          ownerInfo = ownerData[0]; // RPC returns an array, get first result
        }
      } catch (error) {
        console.log('RPC function not available yet, will use fallback');
      }
    }
  }

  // Combine the data
  const tenantWithOwners = {
    ...tenant,
    user_tenants: userTenants || [],
    owner_info: ownerInfo
  };

  return <TenantDetailClient tenant={tenantWithOwners} />;
}
