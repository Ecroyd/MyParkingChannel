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

  const cfg = (data?.config as any) ?? {};

  if (!cfg.operator_id || !cfg.operator_private_key || !cfg.subscription_key) {
    console.warn('[CAVU] Incomplete config for tenant', tenantId, cfg);
    return null;
  }

  const config: CavuConfig = {
    operator_id: Number(cfg.operator_id),
    operator_private_key: String(cfg.operator_private_key),
    subscription_key: String(cfg.subscription_key),
  };

  return config;
}
