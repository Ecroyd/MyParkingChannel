// Helper functions for ANPR relay authentication using SHA256 hashed tokens

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Hash a relay token using SHA256
 */
export function hashRelayToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Timing-safe comparison to prevent timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Authenticate relay request using x-relay-token header
 * Returns the anpr_site record if valid, null otherwise
 */
export async function authenticateRelayRequest(
  tenantId: string,
  providedToken: string | null
): Promise<{ id: string; tenant_id: string; enabled: boolean } | null> {
  if (!providedToken) {
    return null;
  }

  const supabase = createAdminClient();

  // Fetch anpr_site for this tenant
  const { data: site, error } = await supabase
    .from('anpr_sites')
    .select('id, tenant_id, enabled, relay_token_hash')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !site) {
    return null;
  }

  // Hash the provided token and compare
  const providedHash = hashRelayToken(providedToken);
  if (!timingSafeEqual(providedHash, site.relay_token_hash)) {
    return null;
  }

  return {
    id: site.id,
    tenant_id: site.tenant_id,
    enabled: site.enabled,
  };
}

/**
 * Generate a new random relay token (32 bytes, hex encoded = 64 chars)
 */
export function generateRelayToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

