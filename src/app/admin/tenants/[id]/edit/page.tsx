import { requirePlatformAdmin } from "@/lib/guards";
import EditTenantClient from './EditTenantClient';

export default async function EditTenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { adminClient } = await requirePlatformAdmin();

  // Fetch tenant data
  const { data: tenant, error: tenantError } = await adminClient
    .from('tenants')
    .select(`
      id,
      name,
      slug,
      timezone,
      default_capacity,
      created_at
    `)
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

  // Fetch tenant members directly from user_tenants
  const { data: members, error: membersError } = await adminClient
    .from('user_tenants')
    .select(`
      user_id,
      role
    `)
    .eq('tenant_id', id);

  // Try to get owner contact info if available
  let ownerContactInfo = null;
  if (members && members.length > 0) {
    const owner = members.find(m => m.role === 'owner');
    if (owner) {
      try {
        const { data: contactData, error: contactError } = await adminClient.rpc('get_user_contact_info', { p_user_id: owner.user_id });
        if (!contactError && contactData && contactData.length > 0) {
          ownerContactInfo = contactData[0];
        }
      } catch (error) {
        console.log('RPC function not available yet for contact info');
      }
    }
  }

  return (
    <EditTenantClient 
      tenant={tenant} 
      members={members || []}
      ownerContactInfo={ownerContactInfo}
    />
  );
}
