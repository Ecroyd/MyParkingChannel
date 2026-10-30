import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchBody, parseSearchResponse, searchReads, toNvrTime } from '../src/catchUp.ts';
import { DigestClient } from '../src/digest.ts';

// Same shape as the site NVR's eventRecordSearch response (captured 30 Oct 2026); plates and
// picture URLs replaced.
function target(id: number, channel: number, plate: string, at: string) {
  return {
    id,
    channel,
    vehicleMatchResult: { plateNo: plate, vehicleLogo: 'HONDA', vehicleColor: 'gray', plateColor: 'other', plateType: 'unknown', vehicleType: 'SUVMPV' },
    ANPRMatchResult: { licensePlate: plate, province: '0' },
    alarmStartTime: at,
    alarmEndTime: at,
    pictureUrl: 'http://example.invalid/pic',
    smallPictureUrl: 'http://example.invalid/small',
    startTime: at,
    endTime: at,
    eventType: 'vehicleMatchResult',
    metadataMatches: { eventType: 'ANPR', associatedMetadataUrlList: [{ associatedMetadataUrl: { metadataType: 'video', channelID: channel } }] },
  };
}

test('builds the same request body the NVR web UI sends', () => {
  const body = JSON.parse(
    buildSearchBody({
      from: new Date('2026-10-30T00:00:00Z'),
      to: new Date('2026-10-30T23:59:59Z'),
      channels: [1, 2],
      position: 30,
      searchId: '6512CBC0-5699-437D-A2F4-5761F853124E',
    })
  );
  assert.deepEqual(body, {
    EventSearchDescription: {
      searchID: '6512CBC0-5699-437D-A2F4-5761F853124E',
      searchResultPosition: 30,
      maxResults: 30,
      timeSpanList: [{ startTime: '2026-10-30T00:00:00+00:00', endTime: '2026-10-30T23:59:59+00:00' }],
      type: 'all',
      channels: [1, 2],
      eventType: 'vehicleMatchResult',
      ANPRSearch: { country: '255' },
    },
  });
  assert.equal(toNvrTime(new Date('2026-10-30T13:04:32.987Z')), '2026-10-30T13:04:32+00:00');
});

test('parses stored reads', () => {
  const page = parseSearchResponse({
    EventSearchResult: {
      responseStatusStrg: 'MORE',
      numOfMatches: 2,
      totalMatches: 5,
      Targets: [target(1, 2, 'AB12CDE', '2026-10-30T01:44:15+00:00'), target(2, 1, 'unknown', '2026-10-30T01:45:00+00:00')],
    },
  });
  assert.equal(page.status, 'MORE');
  assert.equal(page.returned, 2);
  assert.equal(page.total, 5);
  assert.equal(page.reads.length, 1); // unreadable plate dropped
  assert.deepEqual(
    { ...page.reads[0], raw: undefined },
    {
      plate: 'AB12CDE',
      plateNorm: 'AB12CDE',
      channelId: '2',
      channelName: null,
      occurredAt: '2026-10-30T01:44:15.000Z',
      cameraDirection: null,
      confidence: null,
      eventType: 'vehicleMatchResult',
      raw: undefined,
    }
  );
  assert.equal(page.reads[0].raw.catchUp, 'true');
  assert.equal(page.reads[0].raw.vehicleLogo, 'HONDA');
  assert.equal(parseSearchResponse({ EventSearchResult: { responseStatusStrg: 'NO MATCHES', numOfMatches: 0 } }).reads.length, 0);
});

test('pages through results and returns them oldest first', async () => {
  const bodies: { EventSearchDescription: { searchResultPosition: number; searchID: string } }[] = [];
  const pages = [
    { responseStatusStrg: 'MORE', numOfMatches: 2, totalMatches: 3, Targets: [target(1, 1, 'CC33CCC', '2026-10-30T10:03:00+00:00'), target(2, 2, 'AA11AAA', '2026-10-30T10:01:00+00:00')] },
    { responseStatusStrg: 'OK', numOfMatches: 1, totalMatches: 3, Targets: [target(3, 1, 'BB22BBB', '2026-10-30T10:02:00+00:00')] },
  ];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return Response.json({ EventSearchResult: pages[bodies.length - 1] });
  }) as typeof fetch;

  const reads = await searchReads(new DigestClient('http://nvr', 'u', 'p', fakeFetch), new Date('2026-10-30T10:00:00Z'), new Date('2026-10-30T11:00:00Z'), [1, 2]);

  assert.deepEqual(reads.map((r) => r.plate), ['AA11AAA', 'BB22BBB', 'CC33CCC']);
  assert.deepEqual(bodies.map((b) => b.EventSearchDescription.searchResultPosition), [0, 2]);
  assert.equal(bodies[0].EventSearchDescription.searchID, bodies[1].EventSearchDescription.searchID);
});
