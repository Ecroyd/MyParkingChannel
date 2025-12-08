// src/app/admin/channels/cavu/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { getServerSupabase } from '@/lib/supabase/server';
import { upsertCavuConfig } from './actions';

export const dynamic = 'force-dynamic';

export default async function CavuSettingsPage() {
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    redirect('/login');
  }

  // Only admins and owners can configure suppliers
  if (ctx.role !== 'admin' && ctx.role !== 'owner') {
    redirect('/admin');
  }

  const supabase = await getServerSupabase();

  const { data } = await supabase
    .from('tenant_supplier_configs')
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('supplier_code', 'cavu')
    .maybeSingle();

  const existingConfig = (data?.config as any) ?? {};

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">CAVU / ParkCloud Operator API</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste in your <strong>Operator ID</strong> and{' '}
          <strong>Private Key</strong> from the ParkCloud Operator portal.
          Parking Channel will use these to import bookings automatically.
        </p>
      </div>

      <form
        action={upsertCavuConfig.bind(null, ctx.tenantId)}
        className="space-y-4 bg-white rounded-lg border p-6"
      >
        <div className="space-y-2">
          <label htmlFor="operator_id" className="block text-sm font-medium">
            Operator ID
          </label>
          <input
            id="operator_id"
            name="operator_id"
            type="text"
            defaultValue={existingConfig.operator_id ?? ''}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="e.g. 1234"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="operator_private_key" className="block text-sm font-medium">
            Operator Private Key
          </label>
          <input
            id="operator_private_key"
            name="operator_private_key"
            type="password"
            defaultValue={existingConfig.operator_private_key ?? ''}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Paste key from ParkCloud Operator API page"
            required
          />
          <p className="text-xs text-muted-foreground">
            This is stored securely in Supabase and never exposed to customers.
          </p>
        </div>

        <div className="flex items-center gap-4 pt-4">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            Save CAVU Settings
          </button>
          <a
            href="/admin/channels"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}

