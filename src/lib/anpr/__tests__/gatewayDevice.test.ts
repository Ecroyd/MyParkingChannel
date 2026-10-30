import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isGatewayDeviceId, touchGatewayDevice } from '@/lib/anpr/gatewayDevice';

const DEVICE = '3f2b7c1e-8a4d-4e2b-9c6f-1a2b3c4d5e6f';
const TENANT = 'bab45dab-19e8-4230-b18e-ee1f663608e5';

// Minimal chainable stub for .from().update().eq().eq().eq().select()
function stubSupabase(result: { data: unknown; error: unknown }) {
  const calls: { update?: unknown; eq: [string, unknown][] } = { eq: [] };
  const chain = {
    update: vi.fn((v: unknown) => ((calls.update = v), chain)),
    eq: vi.fn((col: string, val: unknown) => (calls.eq.push([col, val]), chain)),
    select: vi.fn(async () => result),
  };
  const client = { from: vi.fn(() => chain) } as unknown as SupabaseClient;
  return { client, calls };
}

describe('isGatewayDeviceId', () => {
  it('accepts UUIDs only', () => {
    expect(isGatewayDeviceId(DEVICE)).toBe(true);
    expect(isGatewayDeviceId('gateway-1')).toBe(false);
    expect(isGatewayDeviceId(undefined)).toBe(false);
  });
});

describe('touchGatewayDevice', () => {
  it('rejects a malformed id without querying', async () => {
    const { client } = stubSupabase({ data: [], error: null });
    const res = await touchGatewayDevice(client, TENANT, 'nope');
    expect(res).toEqual({ ok: false, status: 400, error: expect.any(String) });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('updates last_seen scoped to the tenant and active devices', async () => {
    const { client, calls } = stubSupabase({ data: [{ id: DEVICE }], error: null });
    const seenAt = new Date('2026-10-30T13:00:00Z');
    const res = await touchGatewayDevice(client, TENANT, DEVICE, seenAt);
    expect(res).toEqual({ ok: true });
    expect(calls.update).toEqual({ last_seen: seenAt.toISOString() });
    expect(calls.eq).toEqual([
      ['id', DEVICE],
      ['tenant_id', TENANT],
      ['status', 'active'],
    ]);
  });

  it('returns 404 when no active device of this tenant matched', async () => {
    const { client } = stubSupabase({ data: [], error: null });
    const res = await touchGatewayDevice(client, TENANT, DEVICE);
    expect(res).toMatchObject({ ok: false, status: 404 });
  });
});
