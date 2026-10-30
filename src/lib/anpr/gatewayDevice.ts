// src/lib/anpr/gatewayDevice.ts
//
// On-site ANPR gateways identify themselves with a gate_devices row. Touching that row's
// last_seen is what the admin ANPR page reads as "connected" (see resolveAnprLifecycleState).
//
// They authenticate either with the tenant relay token plus a device_id, or — for gateways set up
// with a pairing code — with that device's own key in the x-gateway-key header.

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateGateDeviceKeyPair, hashGateDeviceKey } from '@/lib/devices/gateDeviceKeys';
import { getRelayTokenFromRequest, verifyRelayToken } from '@/lib/anpr/relayTokenAuth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GATEWAY_KEY_HEADER = 'x-gateway-key';

/** Create the gate device for a newly paired gateway; returns its raw key (shown only once). */
export async function createGatewayDevice(
  supabase: SupabaseClient,
  tenantId: string,
  name: string
): Promise<{ deviceId: string; deviceKey: string }> {
  const { rawKey, api_key_hash } = generateGateDeviceKeyPair();
  const { data, error } = await supabase
    .from('gate_devices')
    .insert({ tenant_id: tenantId, name, kind: 'anpr', status: 'active', api_key_hash })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Could not create gate device: ${error?.message ?? 'no row'}`);
  return { deviceId: data.id, deviceKey: rawKey };
}

export type VerifyGatewayKeyResult =
  | { ok: true; deviceId: string }
  | { ok: false; status: 401 | 403 | 500; error: string };

export type GatewayRequestAuth =
  | { ok: true; via: 'gateway_key'; deviceId: string }
  | { ok: true; via: 'relay_token'; deviceId: null }
  | { ok: false; status: number; error: string };

/**
 * Authenticate a gateway call: x-gateway-key when present (the device is implied), otherwise the
 * tenant relay token (the caller may name a device_id separately).
 */
export async function authenticateGatewayRequest(
  req: Request,
  supabase: SupabaseClient,
  tenantId: string,
  opts: { requireEnabledSite?: boolean } = {}
): Promise<GatewayRequestAuth> {
  const gatewayKey = req.headers.get(GATEWAY_KEY_HEADER)?.trim();
  if (gatewayKey) {
    const verified = await verifyGatewayDeviceKey(supabase, tenantId, gatewayKey);
    return verified.ok ? { ok: true, via: 'gateway_key', deviceId: verified.deviceId } : verified;
  }
  const relay = await verifyRelayToken(tenantId, getRelayTokenFromRequest(req), opts);
  if (!relay.ok) {
    return { ok: false, status: relay.status, error: relay.status === 401 ? 'Invalid relay token' : relay.error };
  }
  return { ok: true, via: 'relay_token', deviceId: null };
}

/** Check an x-gateway-key against an active ANPR gate device of this tenant. */
export async function verifyGatewayDeviceKey(
  supabase: SupabaseClient,
  tenantId: string,
  rawKey: string
): Promise<VerifyGatewayKeyResult> {
  const { data, error } = await supabase
    .from('gate_devices')
    .select('id, tenant_id, status, kind')
    .eq('api_key_hash', hashGateDeviceKey(rawKey))
    .maybeSingle();

  if (error) {
    console.error('[ANPR gateway] device key lookup failed:', error);
    return { ok: false, status: 500, error: 'Device lookup failed' };
  }
  if (!data || data.tenant_id !== tenantId) return { ok: false, status: 401, error: 'Invalid gateway key' };
  if (data.status !== 'active' || data.kind !== 'anpr') {
    return { ok: false, status: 403, error: 'Gateway device is not active' };
  }
  return { ok: true, deviceId: data.id };
}

export function isGatewayDeviceId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export type TouchGatewayDeviceResult =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 500; error: string };

/** Set last_seen on an active gate device that belongs to the tenant. */
export async function touchGatewayDevice(
  supabase: SupabaseClient,
  tenantId: string,
  deviceId: unknown,
  seenAt: Date = new Date()
): Promise<TouchGatewayDeviceResult> {
  if (!isGatewayDeviceId(deviceId)) {
    return { ok: false, status: 400, error: 'device_id must be a gate device UUID' };
  }

  const { data, error } = await supabase
    .from('gate_devices')
    .update({ last_seen: seenAt.toISOString() })
    .eq('id', deviceId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .select('id');

  if (error) {
    console.error('[ANPR gateway] last_seen update failed:', error);
    return { ok: false, status: 500, error: 'Failed to update gate device' };
  }
  if (!data || data.length === 0) {
    return { ok: false, status: 404, error: 'No active gate device with that id for this tenant' };
  }
  return { ok: true };
}
