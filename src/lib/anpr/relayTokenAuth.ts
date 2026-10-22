// src/lib/anpr/relayTokenAuth.ts
//
// Unified ANPR relay token verification. A relay token is accepted when it matches ANY of:
//  1. env ANPR_RELAY_TOKEN_BAB45DAB for the legacy tenant bab45dab-… (kept for the existing relay);
//  2. anpr_sites.relay_token_hash (sha256 hex) — written by POST /api/internal/anpr/rotate-token;
//  3. tenant_secrets (scope='anpr', key='anpr_relay_token').value_ciphertext — written by
//     POST /api/admin/anpr/relay-token/generate (base64 today, `enc:v1:` once ENCRYPTION_KEY is set).
// so a token rotated through either UI works on every relay endpoint.

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { decryptSecret, timingSafeEqualStr } from '@/lib/crypto/secrets';

export const LEGACY_ENV_RELAY_TENANT = 'bab45dab-19e8-4230-b18e-ee1f663608e5';

export type RelaySite = { id: string; tenant_id: string; enabled: boolean; relay_token_hash?: string | null };

export type RelayTokenSources = {
  envToken: string | null;
  site: RelaySite | null;
  secretCiphertext: string | null;
};

export type RelayTokenMatch = 'env' | 'anpr_sites' | 'tenant_secrets' | null;

/**
 * Prefer headers (x-relay-token, then Authorization: Bearer), then `?token=` for relays that
 * can only set a URL.
 */
export function getRelayTokenFromRequest(req: Request, opts: { allowQuery?: boolean } = {}): string | null {
  const x = req.headers.get('x-relay-token')?.trim();
  if (x) return x;
  const auth = req.headers.get('authorization')?.trim();
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  if (opts.allowQuery !== false) {
    try {
      const q = new URL(req.url).searchParams.get('token')?.trim();
      if (q) return q;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Pure matcher (unit-tested). */
export function matchRelayToken(token: string, sources: RelayTokenSources): RelayTokenMatch {
  if (sources.envToken && timingSafeEqualStr(token, sources.envToken)) return 'env';

  const storedHash = sources.site?.relay_token_hash?.trim().toLowerCase();
  if (storedHash) {
    const provided = crypto.createHash('sha256').update(token).digest('hex');
    if (timingSafeEqualStr(provided, storedHash)) return 'anpr_sites';
  }

  if (sources.secretCiphertext) {
    try {
      const stored = decryptSecret(sources.secretCiphertext, 'base64');
      if (stored && timingSafeEqualStr(token, stored)) return 'tenant_secrets';
    } catch (e) {
      console.error('[ANPR relay auth] could not decode tenant_secrets relay token', e);
    }
  }
  return null;
}

async function loadSources(tenantId: string): Promise<RelayTokenSources> {
  const envToken =
    tenantId === LEGACY_ENV_RELAY_TENANT ? process.env.ANPR_RELAY_TOKEN_BAB45DAB?.trim() || null : null;

  const admin = createAdminClient();
  const [siteRes, secretRes] = await Promise.all([
    admin
      .from('anpr_sites')
      .select('id, tenant_id, enabled, relay_token_hash')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    admin
      .from('tenant_secrets')
      .select('value_ciphertext')
      .eq('tenant_id', tenantId)
      .eq('scope', 'anpr')
      .eq('key', 'anpr_relay_token')
      .maybeSingle(),
  ]);

  if (siteRes.error) throw siteRes.error;
  if (secretRes.error) console.error('[ANPR relay auth] tenant_secrets lookup error', secretRes.error);

  return {
    envToken,
    site: (siteRes.data as RelaySite | null) ?? null,
    secretCiphertext: (secretRes.data as { value_ciphertext?: string | null } | null)?.value_ciphertext ?? null,
  };
}

export type RelayAuthResult =
  | { ok: true; via: Exclude<RelayTokenMatch, null>; site: RelaySite | { id: string; tenant_id: string } }
  | { ok: false; status: number; error: string };

/**
 * Verify a relay token for `tenantId`.
 * `requireEnabledSite`: when an anpr_sites row exists and is disabled, reject with 403
 * (token matches via anpr_sites always require an enabled site, as before).
 */
export async function verifyRelayToken(
  tenantId: string,
  token: string | null,
  opts: { requireEnabledSite?: boolean; loadSources?: (tenantId: string) => Promise<RelayTokenSources> } = {}
): Promise<RelayAuthResult> {
  if (!tenantId) return { ok: false, status: 400, error: 'Missing tenantId' };
  if (!token) return { ok: false, status: 401, error: 'Invalid or missing relay token' };

  let sources: RelayTokenSources;
  try {
    sources = await (opts.loadSources ?? loadSources)(tenantId);
  } catch (e) {
    console.error('[ANPR relay auth] lookup error', e);
    return { ok: false, status: 500, error: 'Auth lookup failed' };
  }

  const via = matchRelayToken(token, sources);
  if (!via) return { ok: false, status: 401, error: 'Invalid or missing relay token' };

  // The env token for the legacy tenant never depended on anpr_sites; keep it that way.
  if (via === 'env') {
    return { ok: true, via, site: sources.site ?? { id: 'env', tenant_id: tenantId } };
  }

  const siteDisabled = sources.site && sources.site.enabled === false;
  if (siteDisabled && (via === 'anpr_sites' || opts.requireEnabledSite)) {
    return { ok: false, status: 403, error: 'ANPR site is not enabled' };
  }

  return { ok: true, via, site: sources.site ?? { id: 'tenant_secrets', tenant_id: tenantId } };
}
