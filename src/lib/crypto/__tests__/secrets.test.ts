import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  ENCRYPTED_PREFIX,
  decryptJsonSecret,
  decryptSecret,
  decryptWithKey,
  deriveKey,
  encryptSecret,
  encryptWithKey,
  isEncryptionConfigured,
  timingSafeEqualStr,
} from '@/lib/crypto/secrets';

const HEX_KEY = 'a'.repeat(64);

describe('tenant secret crypto', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ENCRYPTION_KEY;
    Reflect.deleteProperty(process.env, "ENCRYPTION_KEY");
  });
  afterEach(() => {
    if (saved === undefined) Reflect.deleteProperty(process.env, "ENCRYPTION_KEY");
    else process.env.ENCRYPTION_KEY = saved;
  });

  it('without ENCRYPTION_KEY, writes keep the legacy encoding', () => {
    expect(isEncryptionConfigured()).toBe(false);
    expect(encryptSecret('hello')).toBe(Buffer.from('hello').toString('base64'));
    expect(encryptSecret('hello', 'plain')).toBe('hello');
  });

  it('without ENCRYPTION_KEY, reads keep the legacy decoding', () => {
    expect(decryptSecret(Buffer.from('tok').toString('base64'))).toBe('tok');
    expect(decryptSecret('sk_live_x', 'plain')).toBe('sk_live_x');
  });

  it('with ENCRYPTION_KEY, writes enc:v1 and round-trips', () => {
    process.env.ENCRYPTION_KEY = HEX_KEY;
    const enc = encryptSecret('s3cret');
    expect(enc.startsWith(ENCRYPTED_PREFIX)).toBe(true);
    expect(enc).not.toContain('s3cret');
    expect(decryptSecret(enc)).toBe('s3cret');
    expect(decryptSecret(enc, 'plain')).toBe('s3cret');
    // random IV → different ciphertexts
    expect(encryptSecret('s3cret')).not.toBe(enc);
  });

  it('with ENCRYPTION_KEY, legacy values still decode', () => {
    process.env.ENCRYPTION_KEY = HEX_KEY;
    expect(decryptSecret(Buffer.from('old').toString('base64'))).toBe('old');
    expect(decryptSecret('plain-old', 'plain')).toBe('plain-old');
  });

  it('JSON helper handles both formats', () => {
    const obj = { host: 'sftp', user: 'u' };
    expect(decryptJsonSecret(Buffer.from(JSON.stringify(obj)).toString('base64'))).toEqual(obj);
    process.env.ENCRYPTION_KEY = HEX_KEY;
    expect(decryptJsonSecret(encryptSecret(JSON.stringify(obj)))).toEqual(obj);
  });

  it('fails on enc:v1 value when key is missing or wrong, or tampered', () => {
    const key = deriveKey(HEX_KEY);
    const enc = encryptWithKey('x', key);
    expect(() => decryptSecret(enc)).toThrow(/ENCRYPTION_KEY/);
    expect(() => decryptWithKey(enc, deriveKey('b'.repeat(64)))).toThrow();
    const parts = enc.split(':');
    const ct = Buffer.from(parts[4], 'base64');
    ct[0] ^= 1;
    parts[4] = ct.toString('base64');
    expect(() => decryptWithKey(parts.join(':'), key)).toThrow();
  });

  it('derives 32-byte keys from hex, base64 and passphrases', () => {
    expect(deriveKey(HEX_KEY)).toEqual(Buffer.from(HEX_KEY, 'hex'));
    const raw = crypto.randomBytes(32);
    expect(deriveKey(raw.toString('base64'))).toEqual(raw);
    expect(deriveKey('a passphrase').length).toBe(32);
  });

  it('timingSafeEqualStr', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true);
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false);
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false);
  });
});
