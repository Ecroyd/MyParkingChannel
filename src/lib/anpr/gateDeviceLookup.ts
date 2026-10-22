// src/lib/anpr/gateDeviceLookup.ts
//
// Look up an active gate device by its API key for /api/anpr and /api/qr.
// 1. gate_devices.api_key_hash = sha256(key)  (written by /api/admin/gate-devices/[id]/generate-key,
//    and the only lookup used by /api/gates/events)
// 2. fallback: gate_devices.api_key = key     (legacy plain-text keys; logged as deprecated)

import type { SupabaseClient } from '@supabase/supabase-js';
import { hashGateDeviceKey } from '@/lib/devices/gateDeviceKeys';

export async function findActiveGateDeviceByApiKey<T = any>(
  supabase: SupabaseClient,
  apiKey: string,
  select: string,
  route: string
): Promise<T | null> {
  const { data: hashed, error: hashedError } = await supabase
    .from('gate_devices')
    .select(select)
    .eq('api_key_hash', hashGateDeviceKey(apiKey))
    .eq('status', 'active')
    .maybeSingle();

  if (hashedError) {
    console.error(`[${route}] gate device hash lookup error`, hashedError);
  }
  if (hashed) return hashed as T;

  const { data: plain, error: plainError } = await supabase
    .from('gate_devices')
    .select(select)
    .eq('api_key', apiKey)
    .eq('status', 'active')
    .maybeSingle();

  if (plainError) {
    console.error(`[${route}] gate device plain-key lookup error`, plainError);
    return null;
  }
  if (plain) {
    console.warn(
      `[${route}] DEPRECATED: gate device ${(plain as any).id ?? '?'} authenticated with a plain-text ` +
        'gate_devices.api_key. Generate a new key (stored hashed) in the admin UI.'
    );
    return plain as T;
  }
  return null;
}
