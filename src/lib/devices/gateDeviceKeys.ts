// lib/devices/gateDeviceKeys.ts

import crypto from 'crypto';

export function hashGateDeviceKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

// Convenient helper to generate a new key + hash for the UI
export function generateGateDeviceKeyPair() {
  const rawKey = crypto.randomBytes(32).toString('hex'); // give this to the installer
  const api_key_hash = hashGateDeviceKey(rawKey);        // store this in gate_devices.api_key_hash

  return { rawKey, api_key_hash };
}

