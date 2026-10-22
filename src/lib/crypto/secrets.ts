// src/lib/crypto/secrets.ts
//
// AES-256-GCM encryption for tenant secrets, opt-in via ENCRYPTION_KEY.
//
// Stored format (new): `enc:v1:<iv b64>:<auth tag b64>:<ciphertext b64>`
// Legacy formats (still read): base64-encoded plaintext ("base64") or raw plaintext ("plain"),
// depending on which column/caller wrote it.
//
// Rules:
// - Writes are encrypted ONLY when ENCRYPTION_KEY is set; otherwise the legacy encoding is kept,
//   so nothing changes until the operator sets the key.
// - Reads decrypt `enc:v1:` values and fall back to the legacy decoding for everything else, so
//   existing secrets keep working after the key is set.
//
// ENCRYPTION_KEY may be 64 hex chars (32 bytes), base64 of 32 bytes, or any other string
// (stretched with SHA-256). Do not change it once values are encrypted with it.

import crypto from 'crypto';

export const ENCRYPTED_PREFIX = 'enc:v1:';

export type LegacyEncoding = 'base64' | 'plain';

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function deriveKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) {
    const b = Buffer.from(trimmed, 'base64');
    if (b.length === 32) return b;
  }
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
}

function getConfiguredKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !raw.trim()) return null;
  return deriveKey(raw);
}

export function isEncryptionConfigured(): boolean {
  return getConfiguredKey() !== null;
}

export function isEncryptedValue(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/** Encrypt with an explicit key. Always produces an `enc:v1:` value. */
export function encryptWithKey(plaintext: string, key: Buffer): string {
  if (key.length !== 32) throw new Error('AES-256-GCM key must be 32 bytes');
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypt an `enc:v1:` value with an explicit key. Throws on tampering or wrong key. */
export function decryptWithKey(value: string, key: Buffer): string {
  if (!isEncryptedValue(value)) throw new Error('Value is not enc:v1 encrypted');
  const parts = value.slice(ENCRYPTED_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed enc:v1 value');
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('Malformed enc:v1 value');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

/**
 * Encode a secret for storage. AES-256-GCM (`enc:v1:`) when ENCRYPTION_KEY is set, otherwise the
 * caller's legacy encoding (base64 by default, matching the existing value_ciphertext writers).
 */
export function encryptSecret(plaintext: string, legacy: LegacyEncoding = 'base64'): string {
  const key = getConfiguredKey();
  if (key) return encryptWithKey(plaintext, key);
  return legacy === 'base64' ? Buffer.from(plaintext, 'utf8').toString('base64') : plaintext;
}

/**
 * Decode a stored secret. `enc:v1:` values are decrypted with ENCRYPTION_KEY (throws if the key is
 * missing or wrong); anything else is decoded with the legacy encoding (base64 by default).
 */
export function decryptSecret(stored: string, legacy: LegacyEncoding = 'base64'): string {
  if (isEncryptedValue(stored)) {
    const key = getConfiguredKey();
    if (!key) throw new Error('Encrypted secret found but ENCRYPTION_KEY is not set');
    return decryptWithKey(stored, key);
  }
  return legacy === 'base64' ? Buffer.from(stored, 'base64').toString() : stored;
}

/** decryptSecret + JSON.parse, for JSON blobs stored in value_ciphertext. */
export function decryptJsonSecret<T = unknown>(stored: string): T {
  return JSON.parse(decryptSecret(stored, 'base64')) as T;
}

/** Constant-time string comparison (false on length mismatch). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
