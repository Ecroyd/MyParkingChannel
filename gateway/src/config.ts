// Gateway configuration, read from environment variables (optionally a .env file next to
// package.json). See .env.example for every setting.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export type Direction = 'in' | 'out';

export type GatewayConfig = {
  nvrUrl: string;
  nvrUsername: string;
  nvrPassword: string;
  mpcBaseUrl: string;
  tenantId: string;
  relayToken: string;
  /** gate_devices id for liveness; optional but recommended. */
  deviceId: string | null;
  /** NVR channel id (as it appears in events) -> direction. */
  channelDirections: Map<string, Direction>;
  /**
   * Optional: map the camera's own travel direction (forward/reverse) to in/out. When a read
   * carries a mapped direction it wins over the channel map; empty = channel map only.
   */
  cameraDirections: Map<string, Direction>;
  dedupeSeconds: number;
  heartbeatSeconds: number;
  dataDir: string;
};

/** "1:in,2:out" → Map { '1' => 'in', '2' => 'out' } */
export function parseDirectionMap(name: string, raw: string | undefined): Map<string, Direction> {
  const map = new Map<string, Direction>();
  for (const part of (raw ?? '').split(',')) {
    const [key, dir] = part.split(':').map((s) => s.trim());
    if (!key) continue;
    if (dir !== 'in' && dir !== 'out') {
      throw new Error(`${name}: "${part.trim()}" must look like key:in or key:out`);
    }
    map.set(key.toLowerCase(), dir);
  }
  return map;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required setting ${name} (see .env.example)`);
  return value;
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive whole number`);
  return n;
}

/**
 * @param needsCloud false for `probe`, which only talks to the NVR.
 */
export function loadConfig(
  rootDir: string,
  env: NodeJS.ProcessEnv = process.env,
  needsCloud = true
): GatewayConfig {
  const envFile = resolve(rootDir, '.env');
  if (env === process.env && existsSync(envFile)) process.loadEnvFile(envFile);

  const cloud = (name: string) => (needsCloud ? required(env, name) : env[name]?.trim() ?? '');

  // /capture answers 400 for a malformed device_id, which would park every read.
  const deviceId = env.MPC_DEVICE_ID?.trim() || null;
  if (deviceId && !UUID_RE.test(deviceId)) {
    throw new Error('MPC_DEVICE_ID must be the gate device UUID from the admin ANPR page');
  }

  return {
    nvrUrl: required(env, 'NVR_URL').replace(/\/+$/, ''),
    nvrUsername: required(env, 'NVR_USERNAME'),
    nvrPassword: required(env, 'NVR_PASSWORD'),
    mpcBaseUrl: (env.MPC_BASE_URL?.trim() || 'https://myparkingchannel.app').replace(/\/+$/, ''),
    tenantId: cloud('MPC_TENANT_ID'),
    relayToken: cloud('MPC_RELAY_TOKEN'),
    deviceId,
    channelDirections: parseDirectionMap('CHANNEL_DIRECTIONS', env.CHANNEL_DIRECTIONS),
    cameraDirections: parseDirectionMap('CAMERA_DIRECTIONS', env.CAMERA_DIRECTIONS),
    dedupeSeconds: positiveInt(env, 'DEDUPE_SECONDS', 60),
    heartbeatSeconds: positiveInt(env, 'HEARTBEAT_SECONDS', 300),
    dataDir: resolve(rootDir, env.DATA_DIR?.trim() || 'data'),
  };
}
