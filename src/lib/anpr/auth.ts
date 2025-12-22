// Server-only ANPR relay authentication helpers
// Validates relay tokens against per-tenant hashed tokens in anpr_sites table

import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Extract relay token from request
 * Checks in order:
 * 1. Header "x-relay-token"
 * 2. Header "authorization" (Bearer <token>)
 * 3. Query param "token" (optional fallback)
 */
export function getRelayToken(req: NextRequest): string | null {
  // Try x-relay-token header first
  const headerToken = req.headers.get('x-relay-token');
  if (headerToken) {
    return headerToken;
  }

  // Try Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7); // Remove "Bearer " prefix
  }

  // Try query param as fallback
  const { searchParams } = new URL(req.url);
  const queryToken = searchParams.get('token');
  if (queryToken) {
    return queryToken;
  }

  return null;
}

/**
 * Assert relay authentication for a tenant
 * Throws NextResponse with 401 if invalid
 * Returns void if valid
 */
export async function assertRelayAuth(
  req: NextRequest,
  tenantId: string
): Promise<void> {
  const token = getRelayToken(req);

  if (!token) {
    throw new Response(
      JSON.stringify({ error: 'Invalid or missing relay token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Hash the token using SHA256
  const hash = createHash('sha256').update(token).digest('hex');

  // Fetch anpr_sites row using service role client (bypasses RLS)
  const supabase = createAdminClient();

  const { data: site, error } = await supabase
    .from('anpr_sites')
    .select('id, tenant_id, enabled, relay_token_hash')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !site) {
    throw new Response(
      JSON.stringify({ error: 'Invalid or missing relay token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Timing-safe comparison (both hashes should be lowercase hex)
  const storedHash = site.relay_token_hash.toLowerCase();
  const providedHashLower = hash.toLowerCase();
  
  // Simple comparison (hashes are deterministic, timing attacks less relevant here)
  // But we could use crypto.timingSafeEqual if needed
  if (storedHash !== providedHashLower) {
    throw new Response(
      JSON.stringify({ error: 'Invalid or missing relay token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if site is enabled
  if (!site.enabled) {
    throw new Response(
      JSON.stringify({ error: 'ANPR site is not enabled' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Auth successful
  return;
}

