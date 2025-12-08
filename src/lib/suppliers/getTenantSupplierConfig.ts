// src/lib/suppliers/getTenantSupplierConfig.ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { CavuConfig } from './cavu';

export async function getCavuConfigForTenant(
  tenantId: string
): Promise<CavuConfig | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('tenant_supplier_configs')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('supplier_code', 'cavu')
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[CAVU] Error loading config', error);
    }
    return null;
  }

  const config = data?.config as Partial<CavuConfig> | null;
  if (!config?.operator_id || !config.operator_private_key) {
    console.warn('[CAVU] Incomplete config for tenant', tenantId);
    return null;
  }

  return {
    operator_id: Number(config.operator_id),
    operator_private_key: String(config.operator_private_key),
  };
}

