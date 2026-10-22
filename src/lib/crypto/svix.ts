// src/lib/crypto/svix.ts
//
// Svix-style webhook signature verification (used by Resend).
// Headers: svix-id, svix-timestamp (unix seconds), svix-signature ("v1,<base64> v1,<base64> ...").
// Secret: "whsec_<base64>" (the prefix is optional; the remainder is base64-decoded).
// Signed content: `${id}.${timestamp}.${body}`, HMAC-SHA256.

import crypto from 'crypto';

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type SvixVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing_headers' | 'bad_timestamp' | 'timestamp_out_of_tolerance' | 'bad_secret' | 'no_matching_signature' };

export function readSvixHeaders(headers: Headers): SvixHeaders {
  return {
    id: headers.get('svix-id') ?? headers.get('webhook-id'),
    timestamp: headers.get('svix-timestamp') ?? headers.get('webhook-timestamp'),
    signature: headers.get('svix-signature') ?? headers.get('webhook-signature'),
  };
}

export function decodeSvixSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const b64 = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : trimmed;
  return Buffer.from(b64, 'base64');
}

export function signSvixPayload(secret: string, id: string, timestamp: string, body: string): string {
  const key = decodeSvixSecret(secret);
  return crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`, 'utf8').digest('base64');
}

export function verifySvixSignature(
  secret: string,
  headers: SvixHeaders,
  body: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SVIX_TOLERANCE_SECONDS
): SvixVerifyResult {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' };

  if (!/^\d+$/.test(timestamp)) return { ok: false, reason: 'bad_timestamp' };
  const ts = Number(timestamp);
  if (Math.abs(nowSeconds - ts) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  const key = decodeSvixSecret(secret);
  if (key.length === 0) return { ok: false, reason: 'bad_secret' };

  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`, 'utf8').digest();

  for (const part of signature.split(' ')) {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) continue;
    let provided: Buffer;
    try {
      provided = Buffer.from(sig, 'base64');
    } catch {
      continue;
    }
    if (provided.length === expected.length && crypto.timingSafeEqual(provided, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'no_matching_signature' };
}
