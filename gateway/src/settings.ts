// Settings saved by the set-up page (settings.json in the data directory). The NVR password and
// the device key live here, so the Windows installer restricts the folder to SYSTEM and
// Administrators.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Direction } from './config.ts';

export type StoredSettings = {
  mpcBaseUrl: string;
  tenantId: string;
  tenantName: string | null;
  deviceId: string;
  deviceKey: string;
  nvrUrl: string;
  nvrUsername: string;
  nvrPassword: string;
  /** NVR channel id -> direction, e.g. { "1": "in", "2": "out" } */
  channelDirections: Record<string, Direction>;
  /** false turns off auto-update (background gateway only). Absent = on. */
  autoUpdate?: boolean;
  /** Phase 2: keep these cameras' allow-lists in step with My Parking Channel. */
  allowList?: AllowListSettings;
};

export type AllowListSettings = {
  enabled: boolean;
  /** Each ANPR camera, e.g. through the NVR's Virtual Host (http://192.168.1.88:65001). */
  cameras: { name: string; url: string; username: string; password: string }[];
};

/** Pairing done but NVR not saved yet. */
export type PartialSettings = Partial<StoredSettings>;

export const SETTINGS_FILE = 'settings.json';

export function loadSettings(dataDir: string): PartialSettings | null {
  const file = join(dataDir, SETTINGS_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as PartialSettings;
  } catch {
    return null;
  }
}

export function saveSettings(dataDir: string, settings: PartialSettings): void {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, SETTINGS_FILE);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
}

export function isComplete(s: PartialSettings | null): s is StoredSettings {
  return Boolean(
    s?.mpcBaseUrl &&
      s.tenantId &&
      s.deviceId &&
      s.deviceKey &&
      s.nvrUrl &&
      s.nvrUsername &&
      s.nvrPassword &&
      s.channelDirections &&
      Object.keys(s.channelDirections).length > 0
  );
}
