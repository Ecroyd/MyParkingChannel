// Helper to decrypt tenant secrets
// Matches the pattern used in other integrations

/**
 * Decrypt a tenant secret value
 * TODO: Implement proper decryption using ENCRYPTION_KEY
 * For now, using base64 decode (matches existing pattern)
 */
export function decryptTenantSecret<T = any>(encryptedValue: string): T {
  try {
    const decrypted = Buffer.from(encryptedValue, 'base64').toString();
    return JSON.parse(decrypted) as T;
  } catch (error: any) {
    throw new Error(`Failed to decrypt tenant secret: ${error.message}`);
  }
}

