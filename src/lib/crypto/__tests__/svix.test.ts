import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { readSvixHeaders, signSvixPayload, verifySvixSignature } from '@/lib/crypto/svix';

const SECRET = 'whsec_' + crypto.randomBytes(24).toString('base64');
const BODY = JSON.stringify({ type: 'email.delivered', data: { email_id: 'abc' } });
const NOW = 1_760_000_000;

function headersFor(sig: string, ts = String(NOW), id = 'msg_123') {
  return { id, timestamp: ts, signature: sig };
}

describe('verifySvixSignature', () => {
  it('accepts a valid signature', () => {
    const sig = signSvixPayload(SECRET, 'msg_123', String(NOW), BODY);
    expect(verifySvixSignature(SECRET, headersFor(`v1,${sig}`), BODY, NOW)).toEqual({ ok: true });
  });

  it('accepts when one of several signatures matches', () => {
    const sig = signSvixPayload(SECRET, 'msg_123', String(NOW), BODY);
    const header = `v1,${Buffer.alloc(32).toString('base64')} v1,${sig}`;
    expect(verifySvixSignature(SECRET, headersFor(header), BODY, NOW).ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = signSvixPayload(SECRET, 'msg_123', String(NOW), BODY);
    const r = verifySvixSignature(SECRET, headersFor(`v1,${sig}`), BODY + ' ', NOW);
    expect(r).toEqual({ ok: false, reason: 'no_matching_signature' });
  });

  it('rejects a different secret', () => {
    const other = 'whsec_' + crypto.randomBytes(24).toString('base64');
    const sig = signSvixPayload(other, 'msg_123', String(NOW), BODY);
    expect(verifySvixSignature(SECRET, headersFor(`v1,${sig}`), BODY, NOW).ok).toBe(false);
  });

  it('rejects missing headers', () => {
    expect(verifySvixSignature(SECRET, { id: null, timestamp: null, signature: null }, BODY, NOW)).toEqual({
      ok: false,
      reason: 'missing_headers',
    });
  });

  it('enforces the 5-minute tolerance', () => {
    const old = String(NOW - 301);
    const sig = signSvixPayload(SECRET, 'msg_123', old, BODY);
    expect(verifySvixSignature(SECRET, headersFor(`v1,${sig}`, old), BODY, NOW)).toEqual({
      ok: false,
      reason: 'timestamp_out_of_tolerance',
    });
    const fine = String(NOW - 299);
    const sig2 = signSvixPayload(SECRET, 'msg_123', fine, BODY);
    expect(verifySvixSignature(SECRET, headersFor(`v1,${sig2}`, fine), BODY, NOW).ok).toBe(true);
  });

  it('rejects non-numeric timestamps and unknown versions', () => {
    const sig = signSvixPayload(SECRET, 'msg_123', String(NOW), BODY);
    expect(verifySvixSignature(SECRET, headersFor(`v1,${sig}`, 'abc'), BODY, NOW).ok).toBe(false);
    expect(verifySvixSignature(SECRET, headersFor(`v2,${sig}`), BODY, NOW).ok).toBe(false);
  });

  it('reads svix-* headers', () => {
    const h = new Headers({ 'svix-id': 'a', 'svix-timestamp': '1', 'svix-signature': 'v1,x' });
    expect(readSvixHeaders(h)).toEqual({ id: 'a', timestamp: '1', signature: 'v1,x' });
  });
});
