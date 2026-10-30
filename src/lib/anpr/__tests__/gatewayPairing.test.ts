import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generatePairingCode,
  hashPairingCode,
  issuePairingCode,
  normalizePairingCode,
  pairingMatches,
  redeemPairingCode,
} from '@/lib/anpr/gatewayPairing';
import { verifyGatewayDeviceKey } from '@/lib/anpr/gatewayDevice';
import { hashGateDeviceKey } from '@/lib/devices/gateDeviceKeys';
import { encryptSecret } from '@/lib/crypto/secrets';

const TENANT = '11111111-2222-3333-4444-555555555555';
const NOW = new Date('2026-10-30T12:00:00Z');

/** Chainable query stub: every builder method returns itself; awaiting resolves `result`. */
function query(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'delete', 'upsert', 'insert', 'update']) {
    q[m] = vi.fn(() => q);
  }
  q.maybeSingle = vi.fn(async () => result);
  q.single = vi.fn(async () => result);
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

describe('pairing codes', () => {
  it('generates readable XXXX-XXXX codes without ambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    }
  });

  it('normalises what people type', () => {
    expect(normalizePairingCode(' k7qm-2xpa ')).toBe('K7QM2XPA');
    expect(hashPairingCode('k7qm 2xpa')).toBe(hashPairingCode('K7QM-2XPA'));
  });

  it('matches only a live code', () => {
    const stored = { hash: hashPairingCode('K7QM-2XPA'), expiresAt: '2026-10-30T12:15:00Z' };
    expect(pairingMatches(stored, 'k7qm2xpa', NOW)).toBe(true);
    expect(pairingMatches(stored, 'K7QM-2XPB', NOW)).toBe(false);
    expect(pairingMatches(stored, 'K7QM-2XPA', new Date('2026-10-30T12:15:00Z'))).toBe(false);
    expect(pairingMatches(null, 'K7QM-2XPA', NOW)).toBe(false);
  });

  it('stores a hashed code for 15 minutes', async () => {
    const upsert = query({ data: null, error: null });
    const admin = { from: vi.fn(() => upsert) } as unknown as SupabaseClient;
    const { code, expiresAt } = await issuePairingCode(admin, TENANT, 'user-1', NOW);

    expect(expiresAt).toBe('2026-10-30T12:15:00.000Z');
    const [row, opts] = (upsert.upsert as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts).toEqual({ onConflict: 'tenant_id,scope,key' });
    expect(row).toMatchObject({ tenant_id: TENANT, scope: 'anpr', key: 'gateway_pairing', updated_by: 'user-1' });
    expect(row.value_ciphertext).not.toContain(code.replace('-', ''));
  });

  it('redeems a live code once and returns its tenant', async () => {
    const stored = encryptSecret(JSON.stringify({ hash: hashPairingCode('K7QM-2XPA'), expiresAt: '2026-10-30T12:15:00Z' }));
    const lookup = query({ data: [{ tenant_id: 'other', value_ciphertext: 'not-json' }, { tenant_id: TENANT, value_ciphertext: stored }], error: null });
    const del = query({ data: [{ tenant_id: TENANT }], error: null });
    const admin = { from: vi.fn().mockReturnValueOnce(lookup).mockReturnValueOnce(del) } as unknown as SupabaseClient;

    await expect(redeemPairingCode(admin, 'k7qm-2xpa', NOW)).resolves.toEqual({ tenantId: TENANT });
    expect(del.delete).toHaveBeenCalled();
  });

  it('refuses wrong, malformed or already-consumed codes', async () => {
    const stored = encryptSecret(JSON.stringify({ hash: hashPairingCode('K7QM-2XPA'), expiresAt: '2026-10-30T12:15:00Z' }));
    const lookup = () => query({ data: [{ tenant_id: TENANT, value_ciphertext: stored }], error: null });

    const wrong = { from: vi.fn(() => lookup()) } as unknown as SupabaseClient;
    await expect(redeemPairingCode(wrong, 'AAAA-BBBB', NOW)).resolves.toBeNull();

    const short = { from: vi.fn() } as unknown as SupabaseClient;
    await expect(redeemPairingCode(short, 'ABC', NOW)).resolves.toBeNull();
    expect(short.from).not.toHaveBeenCalled();

    // Another request deleted it first.
    const raced = { from: vi.fn().mockReturnValueOnce(lookup()).mockReturnValueOnce(query({ data: [], error: null })) } as unknown as SupabaseClient;
    await expect(redeemPairingCode(raced, 'K7QM-2XPA', NOW)).resolves.toBeNull();
  });
});

describe('gateway device key', () => {
  const device = (over: Record<string, unknown> = {}) => ({ id: 'dev-1', tenant_id: TENANT, status: 'active', kind: 'anpr', ...over });
  const client = (row: unknown) => {
    const q = query({ data: row, error: null });
    return { client: { from: vi.fn(() => q) } as unknown as SupabaseClient, q };
  };

  it('accepts the key of an active ANPR device of the tenant', async () => {
    const { client: c, q } = client(device());
    await expect(verifyGatewayDeviceKey(c, TENANT, 'raw-key')).resolves.toEqual({ ok: true, deviceId: 'dev-1' });
    expect(q.eq).toHaveBeenCalledWith('api_key_hash', hashGateDeviceKey('raw-key'));
  });

  it('rejects unknown keys, other tenants and inactive devices', async () => {
    expect((await verifyGatewayDeviceKey(client(null).client, TENANT, 'k')).ok).toBe(false);
    expect(await verifyGatewayDeviceKey(client(device({ tenant_id: 'other' })).client, TENANT, 'k')).toMatchObject({ status: 401 });
    expect(await verifyGatewayDeviceKey(client(device({ status: 'inactive' })).client, TENANT, 'k')).toMatchObject({ status: 403 });
    expect(await verifyGatewayDeviceKey(client(device({ kind: 'qr' })).client, TENANT, 'k')).toMatchObject({ status: 403 });
  });
});
