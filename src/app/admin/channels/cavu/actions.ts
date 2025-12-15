// src/app/admin/channels/cavu/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';

export async function upsertCavuConfig(tenantId: string, formData: FormData) {
  const ctx = await getCurrentTenantContext();
  
  // Verify user has permission
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'owner')) {
    throw new Error('Unauthorized');
  }

  // Verify tenant matches
  if (ctx.tenantId !== tenantId) {
    throw new Error('Tenant mismatch');
  }

  const operatorId = formData.get('operator_id')?.toString().trim();
  const operatorKey = formData.get('operator_private_key')?.toString().trim();
  const subscriptionKey = formData.get('subscription_key')?.toString().trim();

  if (!operatorId || !operatorKey || !subscriptionKey) {
    throw new Error('Operator ID, Operator Key and Subscription Key are required');
  }

  const supabase = await getServerSupabase();

  const config = {
    operator_id: Number(operatorId),
    operator_private_key: operatorKey,
    subscription_key: subscriptionKey,
  };

  const { error } = await supabase.from('tenant_supplier_configs').upsert(
    {
      tenant_id: tenantId,
      supplier_code: 'cavu',
      config,
    },
    { onConflict: 'tenant_id,supplier_code' } as any
  );

  if (error) {
    console.error('[CAVU] Save config error', error);
    throw error;
  }

  revalidatePath('/admin/channels/cavu');
}
