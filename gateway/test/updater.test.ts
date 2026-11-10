import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSha256File, pickLatestRelease, RELEASES_API, swapExe, Updater } from '../src/updater.ts';
import { compareVersions, GATEWAY_VERSION } from '../src/version.ts';
import { buildInstallScript, buildTaskRefreshScript } from '../src/windowsInstall.ts';

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: [
    { name: 'mpc-gateway.exe', browser_download_url: `https://dl/${tag}/mpc-gateway.exe` },
    { name: 'mpc-gateway.exe.sha256', browser_download_url: `https://dl/${tag}/mpc-gateway.exe.sha256` },
  ],
  ...extra,
});

test('version matches package.json and compares numerically', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(GATEWAY_VERSION, pkg.version);
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.1.0', '0.2.0'), -1);
});

test('picks the newest published gateway release that has a checksum', () => {
  const picked = pickLatestRelease([
    release('gateway-v0.2.0'),
    release('gateway-v0.10.0'),
    release('gateway-v0.11.0', { draft: true }),
    release('gateway-v0.12.0', { prerelease: true }),
    release('v9.9.9'),
    { ...release('gateway-v0.13.0'), assets: [{ name: 'mpc-gateway.exe', browser_download_url: 'x' }] },
  ]);
  assert.deepEqual(picked, {
    version: '0.10.0',
    exeUrl: 'https://dl/gateway-v0.10.0/mpc-gateway.exe',
    sha256Url: 'https://dl/gateway-v0.10.0/mpc-gateway.exe.sha256',
  });
  assert.equal(pickLatestRelease({ message: 'rate limited' }), null);
});

test('reads sha256sum and Get-FileHash style checksum files', () => {
  const h = 'a'.repeat(64);
  assert.equal(parseSha256File(`${h}  mpc-gateway.exe\n`), h);
  assert.equal(parseSha256File(h.toUpperCase()), h);
  assert.equal(parseSha256File('nope'), null);
});

test('swapExe keeps the previous exe beside the new one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-upd-'));
  try {
    const exe = join(dir, 'mpc-gateway.exe');
    writeFileSync(exe, 'old');
    writeFileSync(join(dir, 'mpc-gateway.next.exe'), 'new');
    swapExe(exe, join(dir, 'mpc-gateway.next.exe'));
    assert.equal(readFileSync(exe, 'utf8'), 'new');
    assert.equal(readFileSync(join(dir, 'mpc-gateway.old.exe'), 'utf8'), 'old');
    assert.equal(existsSync(join(dir, 'mpc-gateway.next.exe')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fakeGithub(exe: Buffer, checksum: string, version = '99.0.0'): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url === RELEASES_API) return Response.json([release(`gateway-v${version}`)]);
    if (url.endsWith('.sha256')) return new Response(`${checksum}  mpc-gateway.exe\n`);
    if (url.endsWith('.exe')) return new Response(new Uint8Array(exe));
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

test('Updater installs a newer release only when the checksum matches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-upd-'));
  try {
    const exePath = join(dir, 'mpc-gateway.exe');
    writeFileSync(exePath, 'old build');
    const exe = Buffer.alloc(21 * 1024 * 1024, 7);
    const good = createHash('sha256').update(exe).digest('hex');

    const tampered = new Updater(exePath, fakeGithub(exe, 'b'.repeat(64)));
    assert.equal(await tampered.checkAndInstall(), null);
    assert.match(tampered.status.lastError ?? '', /checksum/);
    assert.equal(readFileSync(exePath, 'utf8'), 'old build');

    const same = new Updater(exePath, fakeGithub(exe, good, GATEWAY_VERSION));
    assert.equal(await same.checkAndInstall(), null);
    assert.equal(same.status.latestVersion, GATEWAY_VERSION);
    assert.equal(readFileSync(exePath, 'utf8'), 'old build');

    const updater = new Updater(exePath, fakeGithub(exe, good));
    assert.equal(await updater.checkAndInstall(), '99.0.0');
    assert.equal(readFileSync(exePath).length, exe.length);
    assert.equal(readFileSync(join(dir, 'mpc-gateway.old.exe'), 'utf8'), 'old build');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('startup task: starts at boot, at sign-in and every 5 minutes; upgrades stop the old copy first', () => {
  const script = buildInstallScript({
    installDir: 'C:\\ProgramData\\MPC Gateway',
    dataDir: 'C:\\ProgramData\\MPC Gateway',
    launch: ['C:\\Users\\Staff\\Downloads\\mpc-gateway.exe'],
    packagedExe: 'C:\\Users\\Staff\\Downloads\\mpc-gateway.exe',
    waitForPid: 4242,
    port: 5719,
  });
  assert.match(script, /-AtStartup/);
  assert.match(script, /-AtLogOn/);
  assert.match(script, /-RepetitionInterval \(New-TimeSpan -Minutes 5\)/);
  assert.match(script, /-MultipleInstances IgnoreNew/);
  assert.match(script, /-Trigger \$triggers/);
  assert.ok(script.indexOf('Stop-ScheduledTask') < script.indexOf('Copy-Item'));

  const refresh = buildTaskRefreshScript();
  assert.match(refresh, /Set-ScheduledTask -TaskName 'MPC ANPR Gateway' -Trigger \$triggers -Settings \$settings/);
  assert.doesNotMatch(refresh, /Stop-ScheduledTask|Register-ScheduledTask/);
});
