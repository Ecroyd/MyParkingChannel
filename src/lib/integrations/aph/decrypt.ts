// Helper to decrypt tenant secrets
// Matches the pattern used in other integrations

import { decryptJsonSecret } from '@/lib/crypto/secrets';

/**
 * Decrypt a tenant secret value (JSON blob in tenant_secrets.value_ciphertext).
 * `enc:v1:` values are AES-256-GCM (ENCRYPTION_KEY); anything else is legacy base64.
 */
export function decryptTenantSecret<T = any>(encryptedValue: string): T {
  try {
    return decryptJsonSecret<T>(encryptedValue);
  } catch (error: any) {
    throw new Error(`Failed to decrypt tenant secret: ${error.message}`);
  }
}
