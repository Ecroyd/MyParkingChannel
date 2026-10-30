import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundaryFromContentType, MultipartParser } from '../src/multipart.ts';

const xml = '<EventNotificationAlert><eventType>ANPR</eventType></EventNotificationAlert>';
const jpeg = Buffer.from([0xff, 0xd8, 0x2d, 0x2d, 0x62, 0x6f, 0x75, 0x6e, 0x64, 0x61, 0x72, 0x79, 0xff, 0xd9]); // contains "--boundary"

function part(type: string, body: Buffer, withLength = true): Buffer {
  const headers = [`Content-Type: ${type}`];
  if (withLength) headers.push(`Content-Length: ${body.length}`);
  return Buffer.concat([Buffer.from(`--boundary\r\n${headers.join('\r\n')}\r\n\r\n`), body, Buffer.from('\r\n')]);
}

test('reads the boundary from the response content type', () => {
  assert.equal(boundaryFromContentType('multipart/mixed; boundary=boundary'), 'boundary');
  assert.equal(boundaryFromContentType('multipart/mixed; boundary="MIME_boundary"'), 'MIME_boundary');
  assert.equal(boundaryFromContentType('application/xml'), null);
});

test('yields XML and image parts, even when the image contains the boundary text', () => {
  const stream = Buffer.concat([part('application/xml', Buffer.from(xml)), part('image/jpeg', jpeg), part('application/xml', Buffer.from(xml))]);
  const parts = new MultipartParser('boundary').push(stream);
  // The last part is only emitted once the next delimiter (or its length) is available.
  assert.equal(parts.length, 3);
  assert.equal(parts[0].body.toString(), xml);
  assert.deepEqual(parts[1].body, jpeg);
  assert.equal(parts[1].headers['content-type'], 'image/jpeg');
});

test('copes with chunks split at every byte', () => {
  const stream = Buffer.concat([part('application/xml', Buffer.from(xml)), part('image/jpeg', jpeg)]);
  const parser = new MultipartParser('boundary');
  const parts = [];
  for (const byte of stream) parts.push(...parser.push(Uint8Array.of(byte)));
  assert.equal(parts.length, 2);
  assert.equal(parts[0].body.toString(), xml);
  assert.deepEqual(parts[1].body, jpeg);
});

test('parts without Content-Length run to the next boundary', () => {
  const stream = Buffer.concat([part('application/xml', Buffer.from(xml), false), Buffer.from('--boundary\r\n')]);
  const parts = new MultipartParser('boundary').push(stream);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].body.toString(), xml);
});
