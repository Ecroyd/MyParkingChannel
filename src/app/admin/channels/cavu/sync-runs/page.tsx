// src/app/admin/channels/cavu/sync-runs/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { createAdminClient } from '@/lib/supabase/server';
import SyncRunsClient from './SyncRunsClient';

export const dynamic = 'force-dynamic';

export default async function SyncRunsPage() {
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    redirect('/login');
  }

  if (ctx.role !== 'admin' && ctx.role !== 'owner') {
    redirect('/admin');
  }

  const supabase = createAdminClient();

  // Get last 50 sync runs
  const { data: runs, error } = await supabase
    .from('supplier_sync_runs')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('supplier_code', 'cavu')
    .order('started_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[SYNC RUNS] Error fetching runs', error);
  }

  return <SyncRunsClient runs={runs || []} />;
}

