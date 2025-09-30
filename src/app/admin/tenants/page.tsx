import { createAdminClient } from '@/lib/supabase/server-admin';
import CreateTenantModal from './CreateTenantModal';
import AssignOwnerModal from './AssignOwnerModal';
import OrphansPanel from './OrphansPanel';
import TenantsClient from './TenantsClient';
import Link from 'next/link';

export default async function AdminTenantsPage() {
  const sb = await createAdminClient();

  const { data: tenants } = await sb
    .from('tenants')
    .select('id, name, slug, timezone, default_capacity, status, created_at')
    .order('created_at', { ascending: false });

  const ids = (tenants ?? []).map(t => t.id);
  let ownersByTenantId = new Map<string, string | null>();
  if (ids.length) {
    const { data: owners } = await sb
      .from('v_tenant_owner')
      .select('tenant_id, owner_email')
      .in('tenant_id', ids);
    owners?.forEach((o: any) => ownersByTenantId.set(o.tenant_id, o.owner_email));
  }

  // Transform tenants data to include user_tenants for the client component
  const tenantsWithUsers = (tenants ?? []).map(tenant => ({
    ...tenant,
    user_tenants: [] // We'll populate this in the client component if needed
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <div className="flex gap-3">
          <Link 
            href="/admin/tenants/orphans"
            className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
          >
            View Orphans
          </Link>
          <CreateTenantModal />
        </div>
      </div>

      <OrphansPanel />

      <TenantsClient initialTenants={tenantsWithUsers} />
    </div>
  );
}
