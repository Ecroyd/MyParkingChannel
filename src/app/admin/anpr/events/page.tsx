// app/admin/anpr/events/page.tsx

import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import AnprEventsClient from './AnprEventsClient';

export default async function AnprEventsPage() {
  const supabase = await createServerClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">ANPR Events</h1>
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
        <h1 className="text-2xl font-semibold mb-2">ANPR Events</h1>
        <p className="text-sm text-gray-600">No tenant access found</p>
      </div>
    );
  }

  // Find the default tenant or use the first one
  const userTenant = userTenants.find(ut => ut.is_default) || userTenants[0];

  if (!userTenant?.tenant_id) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">ANPR Events</h1>
        <p className="text-sm text-gray-600">No tenant found</p>
      </div>
    );
  }

  return <AnprEventsClient tenantId={userTenant.tenant_id} />;
}


