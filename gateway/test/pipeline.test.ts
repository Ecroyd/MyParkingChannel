import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnprNotification } from '../src/anprEvent.ts';
import { loadConfig, parseDirectionMap } from '../src/config.ts';
import { ReadDeduper } from '../src/dedupe.ts';
import { resolveDirection, toCapturePayload } from '../src/pipeline.ts';
import { ReadQueue } from '../src/queue.ts';
import { classifyResponse } from '../src/sender.ts';

const read = parseAnprNotification(
  '<EventNotificationAlert><channelID>1</channelID><channelName>camera 1</channelName><dateTime>2026-10-30T13:04:32Z</dateTime><eventType>ANPR</eventType><ANPR><licensePlate>AB12CDE</licensePlate><direction>reverse</direction></ANPR></EventNotificationAlert>'
)!;

test('direction: channel map, with the camera direction winning when mapped', () => {
  const channelDirections = parseDirectionMap('CHANNEL_DIRECTIONS', '1:in,2:out');
  assert.equal(resolveDirection(read, { channelDirections, cameraDirections: new Map() }), 'in');
  assert.equal(
    resolveDirection(read, { channelDirections, cameraDirections: parseDirectionMap('CAMERA_DIRECTIONS', 'forward:in,reverse:out') }),
    'out'
  );
  assert.equal(resolveDirection({ ...read, channelId: '9' }, { channelDirections, cameraDirections: new Map() }), null);
  assert.throws(() => parseDirectionMap('CHANNEL_DIRECTIONS', '1:entry'), /must look like/);
});

test('builds the /capture payload', () => {
  const payload = toCapturePayload(read, 'in', { deviceId: '3f2b7c1e-8a4d-4e2b-9c6f-1a2b3c4d5e6f' });
  assert.deepEqual(
    { ...payload, raw: undefined },
    {
      plate: 'AB12CDE',
      occurred_at: '2026-10-30T13:04:32.000Z',
      direction: 'in',
      camera_id: '1:camera 1',
      lane: null,
      confidence: null,
      source: 'hikvision',
      device_id: '3f2b7c1e-8a4d-4e2b-9c6f-1a2b3c4d5e6f',
      raw: undefined,
    }
  );
  assert.equal('device_id' in toCapturePayload(read, 'in', { deviceId: null }), false);
});

test('dedupe: repeats within the window count once, per channel', () => {
  const d = new ReadDeduper(60);
  assert.equal(d.accept('AB12CDE', '1', 0), true);
  assert.equal(d.accept('AB12CDE', '1', 30_000), false);
  assert.equal(d.accept('AB12CDE', '1', 80_000), false); // still sitting there: window slides
  assert.equal(d.accept('AB12CDE', '2', 81_000), true);
  assert.equal(d.accept('AB12CDE', '1', 200_000), true);
});

test('queue: survives retries, parks rejected reads', () => {
  const q = new ReadQueue(':memory:');
  const payload = toCapturePayload(read, 'in', { deviceId: null });
  q.enqueue(payload, 1000);
  q.enqueue({ ...payload, plate: 'XY70ABC' }, 1000);

  const [first, second] = q.due(10, 1000);
  q.retry(first.id, first.attempts, 'HTTP 503', 1000);
  assert.deepEqual(q.due(10, 1000).map((r) => r.id), [second.id]); // first is backing off
  assert.equal(q.due(10, 1000 + 5000)[0].id, first.id); // due again after 5s

  q.bury(second.id, 'bad plate', 2000);
  q.done(first.id);
  assert.equal(q.pendingCount(), 0);
  q.close();
});

test('classifies /capture responses', () => {
  assert.deepEqual(classifyResponse(200, { ok: true, duplicate: true }), {
    kind: 'sent',
    duplicate: true,
    result: undefined,
    bookingId: null,
  });
  assert.equal(classifyResponse(400, { error: 'plate is required' }).kind, 'reject');
  for (const status of [401, 403, 404, 429, 500, 503]) {
    assert.equal(classifyResponse(status, null).kind, 'retry', String(status));
  }
});

test('config: requires cloud settings for run, not for probe; validates device id', () => {
  const base = { NVR_URL: 'http://192.168.1.88/', NVR_USERNAME: 'gw', NVR_PASSWORD: 'x' };
  assert.throws(() => loadConfig('/tmp', { ...base }, true), /MPC_TENANT_ID/);
  const probe = loadConfig('/tmp', { ...base }, false);
  assert.equal(probe.nvrUrl, 'http://192.168.1.88');
  assert.throws(
    () => loadConfig('/tmp', { ...base, MPC_TENANT_ID: 't', MPC_RELAY_TOKEN: 'r', MPC_DEVICE_ID: 'gateway-1' }),
    /MPC_DEVICE_ID/
  );
});
