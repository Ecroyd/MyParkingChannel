// app/admin/anpr/page.tsx

import AnprAdminClient from '@/components/admin/anpr/AnprAdminClient';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

export default async function AnprPage() {
  const supabase = await createServerClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">ANPR / Gate Control</h1>
        <p className="text-sm text-gray-600">Please log in to continue</p>
      </div>
    );
  }

  // Get user's default tenant
  const { data: userTenants, error: userTenantsError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (userTenantsError || !userTenants?.length) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">ANPR / Gate Control</h1>
        <p className="text-sm text-gray-600">No tenant access found</p>
      </div>
    );
  }

  // Find the default tenant or use the first one
  const userTenant = userTenants.find(ut => ut.is_default) || userTenants[0];

  if (!userTenant?.tenant_id) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">ANPR / Gate Control</h1>
        <p className="text-sm text-gray-600">No tenant found</p>
      </div>
    );
  }

  return <AnprAdminClient tenantId={userTenant.tenant_id} />;
}

