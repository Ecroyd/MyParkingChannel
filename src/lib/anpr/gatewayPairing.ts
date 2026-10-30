// src/lib/anpr/gatewayPairing.ts
//
// One-time pairing codes for the on-site ANPR gateway app. An admin generates a code on the ANPR
// settings page; the gateway's setup screen sends it to POST /api/gateway/pair, which creates a
// gate device with its own key. Codes are stored hashed in tenant_secrets (one per tenant,
// replaced on regenerate), expire after 15 minutes and are deleted when used.

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptJsonSecret, encryptSecret, timingSafeEqualStr } from '@/lib/crypto/secrets';

export const PAIRING_SCOPE = 'anpr';
export const PAIRING_KEY = 'gateway_pairing';
export const PAIRING_TTL_MS = 15 * 60 * 1000;

/** No 0/O, 1/I/L: the code is read off a screen and typed. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const GATEWAY_DOWNLOAD_URL =
  process.env.ANPR_GATEWAY_DOWNLOAD_URL ||
  'https://github.com/Ecroyd/MyParkingChannel/releases/latest/download/mpc-gateway.exe';

type StoredPairing = { hash: string; expiresAt: string };

/** "K7QM-2XPA" */
export function generatePairingCode(): string {
  let raw = '';
  for (let i = 0; i < 8; i++) raw += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizePairingCode(input: unknown): string {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashPairingCode(code: string): string {
  return crypto.createHash('sha256').update(normalizePairingCode(code), 'utf8').digest('hex');
}

/** Create (or replace) the tenant's pairing code. Returns the code to show once. */
export async function issuePairingCode(
  admin: SupabaseClient,
  tenantId: string,
  userId: string,
  now = new Date()
): Promise<{ code: string; expiresAt: string }> {
  const code = generatePairingCode();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
  const stored: StoredPairing = { hash: hashPairingCode(code), expiresAt };

  const { error } = await admin.from('tenant_secrets').upsert(
    {
      tenant_id: tenantId,
      scope: PAIRING_SCOPE,
      key: PAIRING_KEY,
      value_ciphertext: encryptSecret(JSON.stringify(stored)),
      updated_by: userId,
      updated_at: now.toISOString(),
    },
    { onConflict: 'tenant_id,scope,key' }
  );
  if (error) throw new Error(`Could not store pairing code: ${error.message}`);
  return { code, expiresAt };
}

/** True when a stored pairing matches the code and has not expired. */
export function pairingMatches(stored: StoredPairing | null, code: string, now = new Date()): boolean {
  if (!stored?.hash || !stored.expiresAt) return false;
  if (new Date(stored.expiresAt).getTime() <= now.getTime()) return false;
  return timingSafeEqualStr(stored.hash, hashPairingCode(code));
}

/**
 * Find the tenant whose live pairing code this is and consume it. Returns null for unknown,
 * expired or already-used codes.
 */
export async function redeemPairingCode(
  admin: SupabaseClient,
  code: string,
  now = new Date()
): Promise<{ tenantId: string } | null> {
  if (normalizePairingCode(code).length !== 8) return null;

  const { data, error } = await admin
    .from('tenant_secrets')
    .select('tenant_id, value_ciphertext')
    .eq('scope', PAIRING_SCOPE)
    .eq('key', PAIRING_KEY);
  if (error) throw new Error(`Pairing lookup failed: ${error.message}`);

  for (const row of data ?? []) {
    let stored: StoredPairing | null = null;
    try {
      stored = decryptJsonSecret<StoredPairing>(row.value_ciphertext);
    } catch {
      continue;
    }
    if (!pairingMatches(stored, code, now)) continue;

    // Delete-and-check makes the code single-use even if two requests race.
    const { data: deleted, error: deleteError } = await admin
      .from('tenant_secrets')
      .delete()
      .eq('tenant_id', row.tenant_id)
      .eq('scope', PAIRING_SCOPE)
      .eq('key', PAIRING_KEY)
      .select('tenant_id');
    if (deleteError) throw new Error(`Could not consume pairing code: ${deleteError.message}`);
    return deleted && deleted.length > 0 ? { tenantId: row.tenant_id } : null;
  }
  return null;
}
