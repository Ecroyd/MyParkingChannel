import { createAdminClient } from '@/lib/supabase/server-admin';
import CreateTenantModal from './CreateTenantModal';
import AssignOwnerModal from './AssignOwnerModal';
import OrphansPanel from './OrphansPanel';
import Link from 'next/link';

export default async function AdminTenantsPage() {
  const sb = createAdminClient();

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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(tenants ?? []).map((t) => {
          const ownerEmail = ownersByTenantId.get(t.id) ?? null;
          return (
            <div key={t.id} className="rounded-2xl border p-4 bg-white">
              <div className="flex items-center justify-between">
                <div className="font-medium">{t.name}</div>
                <span className="text-xs rounded-full px-2 py-0.5 border">{t.status}</span>
              </div>
              <div className="mt-2 text-sm text-gray-600">/{t.slug} • {t.timezone} • cap {t.default_capacity}</div>
              <div className="mt-3 text-sm">
                <span className="text-gray-500">Owner:</span>{' '}
                {ownerEmail ? ownerEmail : <span className="text-amber-600">No Owner</span>}
              </div>
              <div className="mt-4 flex gap-2">
                <AssignOwnerModal tenantId={t.id} currentOwnerEmail={ownerEmail} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
