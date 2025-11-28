// lib/supplier/auth.ts
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export type SupplierAuthContext = {
  keyId: string;
  tenantId: string;
  partnerName: string;
  scopes: string[]; // ['products', 'availability', 'bookings']
};

export class SupplierAuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function authenticateSupplierApi(
  rawApiKey: string | null
): Promise<SupplierAuthContext> {
  if (!rawApiKey) {
    throw new SupplierAuthError(401, 'UNAUTHORIZED', 'Missing X-API-Key header');
  }

  const api_key_hash = crypto
    .createHash('sha256')
    .update(rawApiKey)
    .digest('hex');

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('partner_api_keys')
    .select('id, tenant_id, name, scopes, is_active')
    .eq('api_key_hash', api_key_hash)
    .single();

  if (error || !data) {
    throw new SupplierAuthError(401, 'UNAUTHORIZED', 'Invalid API key');
  }

  if (!data.is_active) {
    throw new SupplierAuthError(403, 'FORBIDDEN', 'API key is disabled');
  }

  // Update last_used_at (fire and forget)
  void supabase
    .from('partner_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    keyId: data.id,
    tenantId: data.tenant_id,
    partnerName: data.name,
    scopes: data.scopes ?? [],
  };
}

