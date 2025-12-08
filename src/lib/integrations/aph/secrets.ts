// Helper functions for managing APH SFTP credentials in tenant_secrets

import { createAdminClient } from '@/lib/supabase/server';
import type { AphSftpCredentials } from './types';

/**
 * Simple decryption helper (matches pattern from other integrations)
 * TODO: Implement proper decryption using ENCRYPTION_KEY
 */
function decryptSecret(encryptedValue: string): string {
  // For now, using base64 decode (matches existing pattern)
  return Buffer.from(encryptedValue, 'base64').toString();
}

/**
 * Simple encryption helper (matches pattern from other integrations)
 * TODO: Implement proper encryption using ENCRYPTION_KEY
 */
function encryptSecret(value: string): string {
  return Buffer.from(value).toString('base64');
}

/**
 * Get APH SFTP credentials from tenant_secrets
 */
export async function getAphSftpCredentials(
  tenantId: string
): Promise<AphSftpCredentials | null> {
  const supabase = createAdminClient();

  // Get the encrypted credentials JSON from tenant_secrets
  const { data: secret, error } = await supabase
    .from('tenant_secrets')
    .select('value_ciphertext')
    .eq('tenant_id', tenantId)
    .eq('scope', 'aph_sftp')
    .eq('key', 'SFTP_CREDENTIALS')
    .maybeSingle();

  if (error || !secret || !secret.value_ciphertext) {
    return null;
  }

  try {
    const decrypted = decryptSecret(secret.value_ciphertext);
    const credentials = JSON.parse(decrypted) as AphSftpCredentials;

    // Validate required fields
    if (
      !credentials.host ||
      !credentials.username ||
      !credentials.password ||
      !credentials.port
    ) {
      console.error('[APH] Invalid SFTP credentials: missing required fields');
      return null;
    }

    // Convert legacy format to new format if needed
    const remotePath = (credentials as any).remotePath || (credentials as any).remote_path || '/';
    
    return {
      host: credentials.host,
      port: credentials.port || 22,
      username: credentials.username,
      password: credentials.password || undefined,
      remotePath,
    };
  } catch (error: any) {
    console.error('[APH] Failed to decrypt/parse SFTP credentials:', error);
    return null;
  }
}

/**
 * Save APH SFTP credentials to tenant_secrets
 */
export async function saveAphSftpCredentials(
  tenantId: string,
  credentials: AphSftpCredentials
): Promise<void> {
  const supabase = createAdminClient();

  const encrypted = encryptSecret(JSON.stringify(credentials));

  const { error } = await supabase.from('tenant_secrets').upsert({
    tenant_id: tenantId,
    scope: 'aph_sftp',
    key: 'SFTP_CREDENTIALS',
    value_ciphertext: encrypted,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Failed to save SFTP credentials: ${error.message}`);
  }
}

