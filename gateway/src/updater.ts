// Auto-update for the background (Windows service) gateway. Every few hours it asks GitHub for the
// newest gateway-v* release; when that is newer than this build it downloads mpc-gateway.exe,
// checks it against the release's mpc-gateway.exe.sha256, and swaps it in. Windows lets a running
// exe be renamed (not overwritten), so the running one becomes mpc-gateway.old.exe and the new one
// takes its name; the gateway then exits and the startup task's 5-minute repeat (or the restart
// it asks for) starts the new version. Reads are never lost meanwhile: the NVR keeps them and the
// catch-up search recovers the gap.

import { createHash } from 'node:crypto';
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { log } from './log.ts';
import { compareVersions, GATEWAY_VERSION } from './version.ts';

export const RELEASES_API = 'https://api.github.com/repos/Ecroyd/MyParkingChannel/releases?per_page=30';
const TAG_RE = /^gateway-v(\d+\.\d+\.\d+)$/;
const EXE_ASSET = 'mpc-gateway.exe';
const SHA_ASSET = 'mpc-gateway.exe.sha256';
/** A real build embeds Node: anything this small is not one. */
const MIN_EXE_BYTES = 20 * 1024 * 1024;

export type GatewayRelease = { version: string; exeUrl: string; sha256Url: string };

type GithubRelease = {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name?: string; browser_download_url?: string }[];
};

/** The newest published gateway release that has both the exe and its checksum. */
export function pickLatestRelease(releases: unknown): GatewayRelease | null {
  let best: GatewayRelease | null = null;
  for (const r of Array.isArray(releases) ? (releases as GithubRelease[]) : []) {
    const version = TAG_RE.exec(r?.tag_name ?? '')?.[1];
    if (!version || r.draft || r.prerelease) continue;
    const url = (name: string) => r.assets?.find((a) => a?.name === name)?.browser_download_url;
    const exeUrl = url(EXE_ASSET);
    const sha256Url = url(SHA_ASSET);
    if (!exeUrl || !sha256Url) continue;
    if (!best || compareVersions(version, best.version) > 0) best = { version, exeUrl, sha256Url };
  }
  return best;
}

/** First 64-hex token of a checksum file ("<hash>  mpc-gateway.exe", or just the hash). */
export function parseSha256File(text: string): string | null {
  return /\b([0-9a-f]{64})\b/i.exec(text)?.[1]?.toLowerCase() ?? null;
}

/**
 * Put `nextPath` in place of the running `exePath`, keeping the old one beside it as .old.exe.
 * Rolls back if the second rename fails.
 */
export function swapExe(exePath: string, nextPath: string): void {
  const oldPath = exePath.replace(/\.exe$/i, '') + '.old.exe';
  rmSync(oldPath, { force: true });
  renameSync(exePath, oldPath);
  try {
    renameSync(nextPath, exePath);
  } catch (err) {
    renameSync(oldPath, exePath);
    throw err;
  }
}

/** Remove the previous version left by an update (it was still running then; it isn't now). */
export function cleanUpOldExe(exePath: string): void {
  const oldPath = exePath.replace(/\.exe$/i, '') + '.old.exe';
  if (existsSync(oldPath)) rmSync(oldPath, { force: true });
}

export type UpdaterStatus = {
  lastCheckAt: string | null;
  latestVersion: string | null;
  lastError: string | null;
};

export class Updater {
  readonly status: UpdaterStatus = { lastCheckAt: null, latestVersion: null, lastError: null };
  private readonly exePath: string;
  private readonly fetchImpl: typeof fetch;
  private busy = false;

  constructor(exePath: string, fetchImpl: typeof fetch = fetch) {
    this.exePath = exePath;
    this.fetchImpl = fetchImpl;
  }

  private async get(url: string, timeoutMs: number): Promise<Response> {
    const res = await this.fetchImpl(url, {
      headers: { 'user-agent': `mpc-anpr-gateway/${GATEWAY_VERSION}`, accept: 'application/vnd.github+json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
    return res;
  }

  /**
   * Check once; when a newer release is installed, returns its version (the caller restarts).
   * Never throws: failures are logged and kept in status.
   */
  async checkAndInstall(): Promise<string | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      this.status.lastCheckAt = new Date().toISOString();
      const latest = pickLatestRelease(await (await this.get(RELEASES_API, 30_000)).json());
      this.status.latestVersion = latest?.version ?? null;
      this.status.lastError = null;
      if (!latest || compareVersions(latest.version, GATEWAY_VERSION) <= 0) return null;

      log.info(`Gateway ${latest.version} is available (this is ${GATEWAY_VERSION}); downloading`);
      const expected = parseSha256File(await (await this.get(latest.sha256Url, 30_000)).text());
      if (!expected) throw new Error('The release checksum file is unreadable');
      const exe = Buffer.from(await (await this.get(latest.exeUrl, 10 * 60_000)).arrayBuffer());
      if (exe.length < MIN_EXE_BYTES) throw new Error(`The download is too small (${exe.length} bytes)`);
      const actual = createHash('sha256').update(exe).digest('hex');
      if (actual !== expected) throw new Error('The download does not match the release checksum');

      const nextPath = this.exePath.replace(/\.exe$/i, '') + '.next.exe';
      writeFileSync(nextPath, exe);
      swapExe(this.exePath, nextPath);
      log.info(`Installed gateway ${latest.version}; restarting into it`);
      return latest.version;
    } catch (err) {
      this.status.lastError = err instanceof Error ? err.message : String(err);
      log.warn('Update check failed; will try again later', this.status.lastError);
      return null;
    } finally {
      this.busy = false;
    }
  }
}
