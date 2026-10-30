import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnprNotification } from '../src/anprEvent.ts';

// Shape of a Hikvision ISAPI ANPR notification (fields as documented; to be confirmed against
// this site's NVR with `npm run probe`).
const ANPR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<ipAddress>192.168.254.2</ipAddress>
<channelID>1</channelID>
<dateTime>2026-10-30T13:04:32+00:00</dateTime>
<activePostCount>1</activePostCount>
<eventType>ANPR</eventType>
<eventState>active</eventState>
<eventDescription>ANPR</eventDescription>
<channelName>camera 1</channelName>
<ANPR>
<country>UK</country>
<licensePlate>AB12 CDE</licensePlate>
<line>1</line>
<direction>forward</direction>
<confidenceLevel>98</confidenceLevel>
<plateColor>white</plateColor>
<vehicleType>SUVMPV</vehicleType>
</ANPR>
</EventNotificationAlert>`;

test('parses an ANPR XML notification', () => {
  const read = parseAnprNotification(ANPR_XML);
  assert.ok(read);
  assert.equal(read.plate, 'AB12 CDE');
  assert.equal(read.plateNorm, 'AB12CDE');
  assert.equal(read.channelId, '1');
  assert.equal(read.channelName, 'camera 1');
  assert.equal(read.occurredAt, '2026-10-30T13:04:32.000Z');
  assert.equal(read.cameraDirection, 'forward');
  assert.equal(read.confidence, 0.98);
  assert.equal(read.raw.vehicleType, 'SUVMPV');
});

test('parses the JSON form', () => {
  const read = parseAnprNotification(
    JSON.stringify({
      channelID: 2,
      dateTime: '2026-10-30T14:00:00+01:00',
      eventType: 'vehicleDetection',
      eventState: 'active',
      ANPR: { licensePlate: 'XY70ABC', direction: 'reverse', confidenceLevel: 91 },
    })
  );
  assert.ok(read);
  assert.equal(read.channelId, '2');
  assert.equal(read.occurredAt, '2026-10-30T13:00:00.000Z');
  assert.equal(read.cameraDirection, 'reverse');
});

test('ignores events that are not plate reads', () => {
  const heartbeat = `<EventNotificationAlert><channelID>1</channelID><eventType>videoloss</eventType><eventState>inactive</eventState></EventNotificationAlert>`;
  assert.equal(parseAnprNotification(heartbeat), null);
  assert.equal(parseAnprNotification(ANPR_XML.replace('active</eventState>', 'inactive</eventState>')), null);
  assert.equal(parseAnprNotification(ANPR_XML.replace('AB12 CDE', 'unknown')), null);
  assert.equal(parseAnprNotification('not xml or json'), null);
});

test('falls back to the receive time when the timestamp is missing', () => {
  const at = new Date('2026-10-30T09:00:00Z');
  const read = parseAnprNotification(ANPR_XML.replace(/<dateTime>.*<\/dateTime>/, ''), at);
  assert.equal(read?.occurredAt, at.toISOString());
});
