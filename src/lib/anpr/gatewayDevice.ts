// src/lib/anpr/gatewayDevice.ts
//
// On-site ANPR gateways authenticate with the tenant relay token and identify themselves with a
// gate_devices id. Touching that row's last_seen is what the admin ANPR page reads as
// "connected" (see resolveAnprLifecycleState).

import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
