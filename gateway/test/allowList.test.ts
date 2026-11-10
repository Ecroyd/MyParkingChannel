import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AllowListSync,
  cameraDate,
  looksLikeMassRemoval,
  parseListSearch,
  planChanges,
  testCamera,
  TEST_PLATE,
  type AllowEntry,
  type CameraEntry,
} from '../src/allowList.ts';

const entry = (plate: string, from = '2026-11-11T08:00:00Z', until = '2026-11-15T18:00:00Z'): AllowEntry => ({ plate, validFrom: from, validUntil: until });

test('camera dates are London calendar days', () => {
  assert.equal(cameraDate('2026-07-01T23:30:00Z'), '2026-07-02'); // BST
  assert.equal(cameraDate('2026-11-10T23:30:00Z'), '2026-11-10'); // GMT
});

test('plans additions, re-dates and removals against what was pushed', () => {
  const pushed = new Map<string, CameraEntry>([
    ['KEEP1', { plate: 'KEEP1', from: '2026-11-11', until: '2026-11-15' }],
    ['MOVE1', { plate: 'MOVE1', from: '2026-11-11', until: '2026-11-12' }],
    ['GONE1', { plate: 'GONE1', from: '2026-11-01', until: '2026-11-05' }],
  ]);
  const plan = planChanges([entry('KEEP1'), entry('MOVE1'), entry('NEW1')], pushed);
  assert.deepEqual(plan.upsert.map((e) => e.plate).sort(), ['MOVE1', 'NEW1']);
  assert.deepEqual(plan.remove, ['GONE1']);
  assert.equal(looksLikeMassRemoval({ upsert: [], remove: Array(30).fill('X') }, 40), true);
  assert.equal(looksLikeMassRemoval({ upsert: [], remove: Array(30).fill('X') }, 100), false);
  assert.equal(looksLikeMassRemoval({ upsert: [], remove: ['X'] }, 1), false);
});

test('parses the camera list search result', () => {
  const xml = `<LPListAuditSearchResult><searchID>1</searchID><responseStatusStrg>OK</responseStatusStrg><numOfMatches>2</numOfMatches>
    <LicensePlateInfoList><LicensePlateInfo><id>7</id><LicensePlate>AB12 CDE</LicensePlate><type>whitelist</type></LicensePlateInfo>
    <LicensePlateInfo><id>8</id><LicensePlate>XY99ZZZ</LicensePlate><type>blackList</type></LicensePlateInfo></LicensePlateInfoList></LPListAuditSearchResult>`;
  assert.deepEqual(parseListSearch(xml), {
    status: 'OK',
    returned: 2,
    plates: [
      { id: '7', plate: 'AB12CDE', type: 'whitelist' },
      { id: '8', plate: 'XY99ZZZ', type: 'blackList' },
    ],
  });
});

/** An in-memory camera speaking the three ISAPI calls the gateway uses. */
function fakeCamera(initial: { plate: string; type: string }[] = []) {
  let nextId = 1;
  const list = new Map<string, { plate: string; type: string; from?: string; until?: string }>();
  for (const p of initial) list.set(String(nextId++), p);
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = String(init?.body ?? '');
    calls.push(`${init?.method} ${url.pathname}`);
    if (url.pathname.endsWith('/searchLPListAudit')) {
      const items = [...list.entries()]
        .map(([id, p]) => `<LicensePlateInfo><id>${id}</id><LicensePlate>${p.plate}</LicensePlate><type>${p.type}</type></LicensePlateInfo>`)
        .join('');
      return new Response(`<LPListAuditSearchResult><responseStatusStrg>OK</responseStatusStrg><numOfMatches>${list.size}</numOfMatches><LicensePlateInfoList>${items}</LicensePlateInfoList></LPListAuditSearchResult>`);
    }
    if (url.pathname.endsWith('/licensePlateAuditData/record')) {
      for (const e of JSON.parse(body).LicensePlateInfoList) {
        const existing = [...list.entries()].find(([, p]) => p.plate === e.LicensePlate);
        list.set(existing?.[0] ?? String(nextId++), { plate: e.LicensePlate, type: 'whitelist', from: e.effectiveStartDate, until: e.effectiveTime });
      }
      return Response.json({ statusCode: 1, statusString: 'OK' });
    }
    if (url.pathname.endsWith('/DelLicensePlateAuditData')) {
      for (const id of JSON.parse(body).id) list.delete(id);
      return Response.json({ statusCode: 1, statusString: 'OK' });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  const plates = () => [...list.values()].map((p) => p.plate).sort();
  return { fetchImpl, list, calls, plates };
}

const CAMERA = { name: 'Entry', url: 'http://192.168.1.88:65001', username: 'admin', password: 'pw' };

test('sync adds, re-dates and removes only its own plates, and survives a camera reset', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-al-'));
  const cam = fakeCamera([{ plate: 'STAFFMANUAL', type: 'whitelist' }]);
  let desired = [entry('AB12CDE'), entry('CD34EFG')];
  const sync = new AllowListSync({ cameras: [CAMERA], storePath: join(dir, 'al.db'), fetchDesired: async () => desired, fetchImpl: cam.fetchImpl });
  try {
    let now = Date.parse('2026-11-10T12:00:00Z');
    await sync.run(now);
    assert.deepEqual(cam.plates(), ['AB12CDE', 'CD34EFG', 'STAFFMANUAL']);
    assert.equal(sync.status().cameras[0].plates, 2);

    // Nothing changed: no writes.
    cam.calls.length = 0;
    await sync.run((now += 60_000));
    assert.deepEqual(cam.calls, []);

    // A booking is cancelled and another extended: one delete, one re-date. Manual entry stays.
    desired = [entry('AB12CDE', '2026-11-11T08:00:00Z', '2026-11-20T18:00:00Z')];
    await sync.run((now += 60_000));
    assert.deepEqual(cam.plates(), ['AB12CDE', 'STAFFMANUAL']);
    assert.equal([...cam.list.values()].find((p) => p.plate === 'AB12CDE')?.until, '2026-11-20');

    // The camera loses its list; the 6-hourly read-back puts ours back.
    cam.list.clear();
    await sync.run((now += 7 * 3_600_000));
    assert.deepEqual(cam.plates(), ['AB12CDE']);
  } finally {
    sync.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sync leaves the cameras alone when the list is unavailable or would mostly vanish', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-al-'));
  const cam = fakeCamera();
  let desired: AllowEntry[] | Error = Array.from({ length: 40 }, (_, i) => entry(`PL${i}`));
  const sync = new AllowListSync({
    cameras: [CAMERA],
    storePath: join(dir, 'al.db'),
    fetchDesired: async () => {
      if (desired instanceof Error) throw desired;
      return desired;
    },
    fetchImpl: cam.fetchImpl,
  });
  try {
    await sync.run(Date.parse('2026-11-10T12:00:00Z'));
    assert.equal(cam.plates().length, 40);

    desired = new Error('HTTP 500');
    await sync.run(Date.parse('2026-11-10T12:05:00Z'));
    assert.equal(cam.plates().length, 40);
    assert.match(sync.status().lastFetchError ?? '', /500/);

    desired = [];
    await sync.run(Date.parse('2026-11-10T12:10:00Z'));
    assert.equal(cam.plates().length, 40);
    assert.match(sync.status().cameras[0].lastError ?? '', /Refusing to remove 40/);
  } finally {
    sync.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('camera test adds, finds and removes the test plate', async () => {
  const cam = fakeCamera([{ plate: 'STAFFMANUAL', type: 'whitelist' }]);
  const steps = await testCamera(CAMERA, cam.fetchImpl);
  assert.deepEqual(steps.map((s) => [s.step, s.ok]), [
    ['Read the allow-list', true],
    ['Add test plate', true],
    ['Find test plate', true],
    ['Delete test plate', true],
    ['Check it is gone', true],
  ]);
  assert.deepEqual(cam.plates(), ['STAFFMANUAL']);
  assert.ok(!cam.plates().includes(TEST_PLATE));

  const refused = await testCamera(CAMERA, (async () => new Response('', { status: 401 })) as typeof fetch);
  assert.deepEqual(refused.map((s) => [s.step, s.ok]), [['Read the allow-list', false]]);
  assert.match(refused[0].detail, /username or password/);
});
