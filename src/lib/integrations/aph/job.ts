// Job function to run APH export for a single tenant/channel

import { createAdminClient } from '@/lib/supabase/server';
import { generateAphB1RatesCsv } from './csv';
import { uploadAphRatesFile } from './sftp';
import { realPricingEngine } from './pricingEngineAdapter';
import { decryptTenantSecret } from './decrypt';
import type { AphChannelConfig, AphSftpCredentials, AphProductMapping } from './types';

/**
 * Run APH export for a single channel
 * @param channelId - The tenant_integration_channels.id
 */
export async function runAphExportForChannel(channelId: string): Promise<void> {
  const supabase = createAdminClient();

  // 1) Load channel config + tenant
  const { data: channel, error: channelError } = await supabase
    .from('tenant_integration_channels')
    .select('id, tenant_id, provider, enabled, config')
    .eq('id', channelId)
    .single();

  if (channelError || !channel) {
    console.error('[APH][EXPORT] Channel load error', channelError);
    return;
  }

  if (!channel.enabled || channel.provider !== 'aph_sftp') {
    console.log('[APH][EXPORT] Channel disabled or not APH, skipping', channelId);
    return;
  }

  const tenantId: string = channel.tenant_id;
  
  // Handle both old and new config formats
  const rawConfig = channel.config as any;
  const config: AphChannelConfig = {
    format: 'B1', // Only B1 for now
    supplierCode: rawConfig.supplierCode || rawConfig.supplier_code || '',
    daysAhead: rawConfig.daysAhead || rawConfig.days_ahead || 365,
    validFromDate: rawConfig.validFromDate || rawConfig.valid_from_date,
  };

  // 2) Basic guard against oversized daysAhead
  if (!config.daysAhead || config.daysAhead <= 0 || config.daysAhead > 730) {
    console.warn('[APH][EXPORT] Invalid daysAhead for channel', channelId, config.daysAhead);
    return;
  }

  if (!config.supplierCode) {
    console.warn('[APH][EXPORT] Missing supplierCode for channel', channelId);
    return;
  }

  // 3) Load SFTP credentials from tenant_secrets
  const { data: secret, error: secretsError } = await supabase
    .from('tenant_secrets')
    .select('value_ciphertext')
    .eq('tenant_id', tenantId)
    .eq('scope', 'aph_sftp')
    .eq('key', 'SFTP_CREDENTIALS')
    .maybeSingle();

  if (secretsError || !secret || !secret.value_ciphertext) {
    console.error('[APH][EXPORT] Missing APH SFTP credentials for tenant', tenantId, secretsError);
    return;
  }

  // Decrypt credentials
  let credentials: AphSftpCredentials;
  try {
    const decrypted = decryptTenantSecret<AphSftpCredentials>(secret.value_ciphertext);
    
    // Handle legacy format (remote_path) and new format (remotePath)
    if ('remote_path' in decrypted && !('remotePath' in decrypted)) {
      const credsAny = decrypted as any;
      credentials = {
        ...credsAny,
        remotePath: credsAny.remote_path || '/',
      } as AphSftpCredentials;
    } else {
      credentials = decrypted;
    }
    
    if (!credentials.remotePath) {
      credentials.remotePath = '/';
    }
  } catch (error: any) {
    console.error('[APH][EXPORT] Failed to decrypt SFTP credentials', error);
    return;
  }

  // 4) Load product mappings for this tenant
  // For now, we'll use a simple approach: get all active products and use their codes
  // In the future, you can create a channel_product_mappings table
  const { data: productRows, error: productsError } = await supabase
    .from('products')
    .select('id, code')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (productsError || !productRows || productRows.length === 0) {
    console.error('[APH][EXPORT] No active products for tenant', tenantId, productsError);
    return;
  }

  // Map products: use product code as APH product code (or create a mapping table later)
  const products: AphProductMapping[] = productRows.map((row) => ({
    productCode: row.code || row.id.slice(0, 3).padStart(3, '0'), // Use code or generate from ID
    internalProductId: row.id,
  }));

  let status: 'success' | 'failed' = 'success';
  let errorMessage: string | null = null;
  let filename = '';
  let rowsCount = 0;

  try {
    // 5) Generate CSV (B.1 only for now)
    const result = await generateAphB1RatesCsv({
      tenantId,
      config,
      products,
      pricingEngine: realPricingEngine,
    });

    filename = result.filename;
    rowsCount = result.rowsCount;

    // 6) Upload via SFTP
    await uploadAphRatesFile({
      credentials,
      filename,
      content: result.csv,
    });

    console.log('[APH][EXPORT] Export success', { tenantId, channelId, filename, rowsCount });
  } catch (err: any) {
    status = 'failed';
    errorMessage = err?.message ?? 'Unknown error';
    console.error('[APH][EXPORT] Export failed', err);
  }

  // 7) Insert log row
  await supabase.from('aph_rate_exports').insert({
    tenant_id: tenantId,
    channel_id: channel.id,
    filename,
    rows_count: rowsCount,
    status,
    error_message: errorMessage,
    ran_at: new Date().toISOString(),
  });

  // Optionally update last_export_at on tenant_integration_channels
  // First check if column exists, if not we'll skip this
  if (status === 'success') {
    // Try to update - if column doesn't exist, this will fail silently
    await supabase
      .from('tenant_integration_channels')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', channel.id)
      .catch(() => {
        // Ignore if column doesn't exist
      });
  }
}

