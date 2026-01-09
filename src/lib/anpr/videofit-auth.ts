// Server-only Videofit ingest authentication helpers
// Validates videofit ingest tokens against per-tenant hashed tokens in tenant_anpr_config

import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Extract videofit ingest token from request
 * Checks header "x-videofit-token"
 */
export function getVideofitIngestToken(req: NextRequest): string | null {
  const headerToken = req.headers.get('x-videofit-token');
  return headerToken || null;
}

/**
 * Assert videofit ingest authentication for a tenant
 * Throws NextResponse with 401 if invalid
 * Returns void if valid
 */
export async function assertVideofitIngestAuth(
  req: NextRequest,
  tenantId: string
): Promise<void> {
  const token = getVideofitIngestToken(req);

  if (!token) {
    throw new Response(
      JSON.stringify({ error: 'Invalid or missing videofit ingest token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Hash the token using SHA256
  const hash = createHash('sha256').update(token).digest('hex');

  // Fetch tenant_anpr_config row using service role client (bypasses RLS)
  const supabase = createAdminClient();

  const { data: config, error } = await supabase
    .from('tenant_anpr_config')
    .select('videofit_ingest_enabled, videofit_ingest_token_hash')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !config) {
    throw new Response(
      JSON.stringify({ error: 'Invalid or missing videofit ingest token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if ingest is enabled
  if (!config.videofit_ingest_enabled) {
    throw new Response(
      JSON.stringify({ error: 'Videofit ingest is not enabled for this tenant' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if token hash matches
  if (!config.videofit_ingest_token_hash) {
    throw new Response(
      JSON.stringify({ error: 'Videofit ingest token not configured' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Timing-safe comparison (both hashes should be lowercase hex)
  const storedHash = config.videofit_ingest_token_hash.toLowerCase();
  const providedHashLower = hash.toLowerCase();
  
  if (storedHash !== providedHashLower) {
    throw new Response(
      JSON.stringify({ error: 'Invalid or missing videofit ingest token' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Auth successful
  return;
}
