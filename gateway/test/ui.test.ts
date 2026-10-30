import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { GatewayApp } from '../src/ui/server.ts';
import { loadSettings } from '../src/settings.ts';
import { parseChannelList } from '../src/nvr.ts';
import { buildInstallScript } from '../src/windowsInstall.ts';

// Loose JSON for assertions on API responses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const json = async (r: Response): Promise<Json> => r.json();

function listen(handler: Parameters<typeof createServer>[1]): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });
}

const CHANNELS_XML = `<?xml version="1.0"?><InputProxyChannelList>
<InputProxyChannel><id>1</id><name>camera 1</name><sourceInputPortDescriptor><ipAddress>192.168.254.2</ipAddress></sourceInputPortDescriptor></InputProxyChannel>
<InputProxyChannel><id>2</id><name>camera 2</name></InputProxyChannel>
<InputProxyChannel><id>3</id><name>yard</name></InputProxyChannel>
</InputProxyChannelList>`;

test('parses the NVR camera list', () => {
  assert.deepEqual(parseChannelList(CHANNELS_XML), [
    { id: '1', name: 'camera 1', ipAddress: '192.168.254.2' },
    { id: '2', name: 'camera 2', ipAddress: null },
    { id: '3', name: 'yard', ipAddress: null },
  ]);
});

test('install script: copies the exe, locks the folder, registers and starts the task', () => {
  const script = buildInstallScript({
    installDir: 'C:\\ProgramData\\MPC Gateway',
    dataDir: 'C:\\ProgramData\\MPC Gateway',
    launch: ['C:\\Users\\Staff\\Downloads\\mpc-gateway.exe'],
    packagedExe: 'C:\\Users\\Staff\\Downloads\\mpc-gateway.exe',
    waitForPid: 4242,
    port: 5719,
  });
  assert.match(script, /Copy-Item -Force -Path \$src -Destination \$exe/);
  assert.match(script, /\$exe = 'C:\\ProgramData\\MPC Gateway\\mpc-gateway\.exe'/);
  assert.match(script, /icacls 'C:\\ProgramData\\MPC Gateway' \/inheritance:r \/grant:r '\*S-1-5-18:\(OI\)\(CI\)F' '\*S-1-5-32-544:\(OI\)\(CI\)F'/);
  assert.match(script, /-Argument 'run --service --data "C:\\ProgramData\\MPC Gateway" --port 5719'/);
  assert.match(script, /Wait-Process -Id 4242/);
  assert.ok(script.indexOf('Register-ScheduledTask') < script.indexOf('Start-ScheduledTask'));
});

test('set-up flow: pair → recorder → cameras, with the local API locked down', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'mpc-gw-'));
  const pairCalls: unknown[] = [];

  const mpc = await listen((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/api/gateway/pair') {
        pairCalls.push(JSON.parse(body));
        const ok = JSON.parse(body).code === 'K7QM-2XPA';
        res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
        res.end(JSON.stringify(ok ? { tenantId: 't-1', tenantName: 'Fly Parks', deviceId: 'd-1', deviceKey: 'secret-key' } : { error: 'That pairing code is wrong' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }); // heartbeat etc.
      res.end('{}');
    });
  });

  const nvr = await listen((req, res) => {
    if (req.url === '/ISAPI/System/deviceInfo') {
      res.end('<DeviceInfo><model>DS-7732NI-M4/24P</model><firmwareVersion>V5.04.081</firmwareVersion></DeviceInfo>');
    } else if (req.url === '/ISAPI/ContentMgmt/InputProxy/channels') {
      res.end(CHANNELS_XML);
    } else if (req.url?.startsWith('/ISAPI/ContentMgmt/eventRecordSearch')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const ch = JSON.parse(body).EventSearchDescription.channels[0];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ EventSearchResult: { responseStatusStrg: 'OK', numOfMatches: 0, totalMatches: ch === 1 ? 140 : ch === 2 ? 133 : 0 } }));
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const app = new GatewayApp({ dataDir, port: 0, service: false, canInstall: false, dryRun: true, install: async () => {} });
  // Port 0 → pick a free one; the server checks the Host header against ctx.port, so set it after.
  const ui = await listen(() => {});
  const port = (ui.server.address() as AddressInfo).port;
  await new Promise<void>((r) => ui.server.close(() => r()));
  (app as unknown as { ctx: { port: number } }).ctx.port = port;
  assert.equal(await app.listen(), true);
  const base = `http://127.0.0.1:${port}`;

  const call = (path: string, body?: unknown, headers: Record<string, string> = { 'x-mpc-gateway': '1' }) =>
    fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  try {
    // Security: page loads; API needs the header, a local Host and a local Origin.
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await call('/api/state', undefined, {})).status, 403);
    assert.equal((await call('/api/state', undefined, { 'x-mpc-gateway': '1', origin: 'https://evil.example' })).status, 403);

    let state = await json(await call('/api/state'));
    assert.equal(state.phase, 'pair');

    // Wrong code is reported; right code pairs and stores the device key.
    const bad = await call('/api/pair', { code: 'AAAA-BBBB', mpcBaseUrl: mpc.url });
    assert.equal(bad.status, 400);
    assert.match((await json(bad)).error, /wrong/);
    assert.equal((await call('/api/pair', { code: 'K7QM-2XPA', mpcBaseUrl: mpc.url })).status, 200);
    assert.equal((pairCalls[1] as { code: string }).code, 'K7QM-2XPA');
    state = await json(await call('/api/state'));
    assert.equal(state.phase, 'nvr');
    assert.equal(state.settings.tenantName, 'Fly Parks');
    assert.equal(JSON.stringify(state).includes('secret-key'), false, 'device key never leaves the gateway');

    // Recorder: lists cameras, ANPR ones first by plate count.
    const nvrRes = await json(await call('/api/nvr', { url: nvr.url, username: 'mpc-gateway', password: 'pw' }));
    assert.equal(nvrRes.device.model, 'DS-7732NI-M4/24P');
    assert.deepEqual(nvrRes.channels.map((c: { id: string; reads7d: number }) => [c.id, c.reads7d]), [['1', 140], ['2', 133], ['3', 0]]);
    state = await json(await call('/api/state'));
    assert.equal(state.phase, 'cameras');
    assert.equal(state.settings.hasNvrPassword, true);
    assert.equal(JSON.stringify(state).includes('"pw"'), false, 'NVR password never sent back to the page');

    // Cameras: at least one is required; then it is running.
    assert.equal((await call('/api/cameras', { channelDirections: { '3': '' } })).status, 400);
    assert.equal((await call('/api/cameras', { channelDirections: { '1': 'in', '2': 'out', '3': 'sideways' } })).status, 200);
    state = await json(await call('/api/state'));
    assert.equal(state.phase, 'running');
    assert.equal(state.status.running, true);

    assert.deepEqual(loadSettings(dataDir), {
      mpcBaseUrl: mpc.url,
      tenantId: 't-1',
      tenantName: 'Fly Parks',
      deviceId: 'd-1',
      deviceKey: 'secret-key',
      nvrUrl: nvr.url,
      nvrUsername: 'mpc-gateway',
      nvrPassword: 'pw',
      channelDirections: { '1': 'in', '2': 'out' },
    });

    // Not on Windows here, so background install is refused.
    assert.equal((await call('/api/install', {})).status, 400);
  } finally {
    await app.stopEngine();
    await app.close();
    await new Promise<void>((r) => mpc.server.close(() => r()));
    nvr.server.closeAllConnections();
    await new Promise<void>((r) => nvr.server.close(() => r()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
