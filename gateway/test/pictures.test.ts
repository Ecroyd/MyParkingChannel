import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PictureUploader, recorderPath, imageType } from '../src/pictures.ts';
import { CloudSender } from '../src/sender.ts';
import type { DigestClient } from '../src/digest.ts';
import type { GatewayConfig } from '../src/config.ts';
import type { QueuedRead } from '../src/queue.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

test('fetches recorder links from the address the gateway uses', () => {
  assert.equal(recorderPath('http://192.168.254.1:80/ISAPI/pic?id=7&x=1'), '/ISAPI/pic?id=7&x=1');
  assert.equal(recorderPath('/ISAPI/pic?id=7'), '/ISAPI/pic?id=7');
  assert.equal(recorderPath('rtsp://cam/x'), null);
  assert.equal(imageType(JPEG), 'image/jpeg');
  assert.equal(imageType(new TextEncoder().encode('<xml/>')), null);
});

function setup() {
  const recorderCalls: string[] = [];
  const http = {
    request: async (path: string) => {
      recorderCalls.push(path);
      return new Response(JPEG, { status: 200 });
    },
  } as unknown as DigestClient;
  const uploads: string[] = [];
  let status = 200;
  const config = { mpcBaseUrl: 'https://mpc.test', tenantId: 't1', deviceKey: 'k' } as unknown as GatewayConfig;
  const sender = new CloudSender(config, (async (url: string, init: RequestInit) => {
    uploads.push(`${url} ${(init.headers as Record<string, string>)['content-type']}`);
    return new Response('{}', { status });
  }) as typeof fetch);
  const item: QueuedRead = {
    id: 1,
    attempts: 0,
    payload: {
      plate: 'AB12CDE', occurred_at: '2026-11-20T12:00:00Z', direction: 'in', camera_id: '1', lane: null,
      confidence: null, source: 'hikvision', raw: {},
      pictures: { plate: 'http://nvr/small?id=1', scene: 'http://nvr/pic?id=1' },
    },
  };
  return { uploader: new PictureUploader(http, sender), recorderCalls, uploads, item, setStatus: (s: number) => (status = s) };
}

test('uploads both pictures of an accepted read when the site keeps pictures', async () => {
  const { uploader, recorderCalls, uploads, item } = setup();
  await uploader.afterSent(item, { duplicate: false, eventId: 'e1' });
  assert.equal(uploads.length, 0, 'off until the heartbeat switches it on');

  uploader.setEnabled(true);
  await uploader.afterSent(item, { duplicate: true, eventId: 'e1' });
  assert.equal(uploads.length, 0, 'duplicates are skipped');

  await uploader.afterSent(item, { duplicate: false, eventId: 'e1' });
  assert.deepEqual(recorderCalls, ['/small?id=1', '/pic?id=1']);
  assert.deepEqual(uploads, [
    'https://mpc.test/api/internal/anpr/picture?tenantId=t1&eventId=e1&kind=plate image/jpeg',
    'https://mpc.test/api/internal/anpr/picture?tenantId=t1&eventId=e1&kind=scene image/jpeg',
  ]);
  assert.equal(uploader.status().uploaded, 2);
});

test('stops when the site says pictures are off', async () => {
  const { uploader, uploads, item, setStatus } = setup();
  uploader.setEnabled(true);
  setStatus(409);
  await uploader.afterSent(item, { duplicate: false, eventId: 'e1' });
  assert.equal(uploads.length, 1);
  assert.equal(uploader.status().enabled, false);
});

test('capture requests never include the picture links', async () => {
  let sent: Record<string, unknown> = {};
  const config = { mpcBaseUrl: 'https://mpc.test', tenantId: 't1', deviceKey: 'k' } as unknown as GatewayConfig;
  const sender = new CloudSender(config, (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ ok: true, eventId: 'e9' }), { status: 200 });
  }) as typeof fetch);
  const outcome = await sender.sendCapture(setup().item.payload);
  assert.equal(sent.pictures, undefined);
  assert.equal(sent.plate, 'AB12CDE');
  assert.deepEqual(outcome.kind === 'sent' && outcome.eventId, 'e9');
});
