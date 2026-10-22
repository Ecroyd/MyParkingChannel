// src/lib/anpr/webhookToken.ts
//
// Opt-in per-tenant token for the vendor ANPR webhooks (/api/anpr/webhook, /api/anpr/events).
//
// Storage: tenant_secrets key-value row (tenant_id, scope='anpr', key='anpr_webhook_token_hash',
// value=<sha256 hex of token>). Only the hash is stored; the raw token is shown once on rotation.
//
// Behaviour:
// - Tenant has a token hash  → request must carry the token (`x-anpr-token` header or `?token=`).
// - Tenant has no token hash → request accepted as before, with a deprecation warning logged.

import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { timingSafeEqualStr } from '@/lib/crypto/secrets';

export const ANPR_WEBHOOK_TOKEN_SCOPE = 'anpr';
export const ANPR_WEBHOOK_TOKEN_KEY = 'anpr_webhook_token_hash';

export type WebhookTokenCheck = 'ok' | 'unconfigured' | 'missing' | 'invalid';

export function hashWebhookToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateWebhookToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** Header `x-anpr-token` (preferred) or `?token=` query param. */
export function getWebhookTokenFromRequest(req: Request): string | null {
  const header = req.headers.get('x-anpr-token')?.trim();
  if (header) return header;
  try {
    const q = new URL(req.url).searchParams.get('token')?.trim();
    return q || null;
  } catch {
    return null;
  }
}

/** Pure decision: compare a provided token with the stored hash (null = not configured). */
export function checkWebhookToken(storedHash: string | null | undefined, provided: string | null): WebhookTokenCheck {
  if (!storedHash) return 'unconfigured';
  if (!provided) return 'missing';
  return timingSafeEqualStr(hashWebhookToken(provided), storedHash.trim().toLowerCase()) ? 'ok' : 'invalid';
}

export async function loadWebhookTokenHash(tenantId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('tenant_secrets')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('scope', ANPR_WEBHOOK_TOKEN_SCOPE)
    .eq('key', ANPR_WEBHOOK_TOKEN_KEY)
    .maybeSingle();
  if (error) throw error;
  return (data as { value?: string | null } | null)?.value ?? null;
}

export async function saveWebhookTokenHash(tenantId: string, hash: string | null): Promise<void> {
  const admin = createAdminClient();
  if (hash === null) {
    const { error } = await admin
      .from('tenant_secrets')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('scope', ANPR_WEBHOOK_TOKEN_SCOPE)
      .eq('key', ANPR_WEBHOOK_TOKEN_KEY);
    if (error) throw error;
    return;
  }
  const { error } = await admin.from('tenant_secrets').upsert(
    {
      tenant_id: tenantId,
      scope: ANPR_WEBHOOK_TOKEN_SCOPE,
      key: ANPR_WEBHOOK_TOKEN_KEY,
      value: hash,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,scope,key' }
  );
  if (error) throw error;
}

/**
 * Authorise a webhook request for `tenantId`. Returns null when the request may proceed,
 * otherwise a Response to return. Logs a deprecation warning for unsigned calls to tenants
 * that have not opted in.
 */
export async function authorizeAnprWebhook(
  req: Request,
  tenantId: string,
  route: string,
  deps: { loadHash?: (tenantId: string) => Promise<string | null> } = {}
): Promise<Response | null> {
  let storedHash: string | null;
  try {
    storedHash = await (deps.loadHash ?? loadWebhookTokenHash)(tenantId);
  } catch (e) {
    // Fail open: cameras must keep working through a DB blip, and accepting unauthenticated
    // events is exactly today's behaviour for tenants without a token.
    console.error(`[${route}] webhook token lookup failed; accepting event`, e);
    return null;
  }

  const result = checkWebhookToken(storedHash, getWebhookTokenFromRequest(req));
  if (result === 'ok') return null;
  if (result === 'unconfigured') {
    console.warn(
      `[${route}] DEPRECATED: unauthenticated ANPR webhook call for tenant ${tenantId}. ` +
        'Generate a webhook token in Admin → Settings → Integrations and send it as x-anpr-token or ?token=.'
    );
    return null;
  }
  return Response.json({ error: 'Invalid or missing ANPR webhook token' }, { status: 401 });
}

/** Build the vendor-facing webhook URL, optionally with the token embedded. */
export function buildAnprWebhookUrl(origin: string, tenantId: string, token?: string | null): string {
  const u = new URL('/api/anpr/webhook', origin);
  u.searchParams.set('tenantId', tenantId);
  if (token) u.searchParams.set('token', token);
  return u.toString();
}
