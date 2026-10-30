import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigestAuthorization, DigestClient, parseDigestChallenge } from '../src/digest.ts';

// RFC 2617 §3.5 worked example.
const RFC_CHALLENGE =
  'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"';

test('parses a Digest challenge', () => {
  assert.deepEqual(parseDigestChallenge(RFC_CHALLENGE), {
    realm: 'testrealm@host.com',
    nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
    qop: 'auth,auth-int',
    opaque: '5ccc069c403ebaf9f0171e9517f40e41',
    algorithm: undefined,
  });
  assert.equal(parseDigestChallenge('Basic realm="x"'), null);
});

test('computes the RFC 2617 response', () => {
  const header = buildDigestAuthorization({
    challenge: parseDigestChallenge(RFC_CHALLENGE)!,
    username: 'Mufasa',
    password: 'Circle Of Life',
    method: 'GET',
    uri: '/dir/index.html',
    nc: 1,
    cnonce: '0a4f113b',
  });
  assert.match(header, /response="6629fae49393a05397450978507c4ef1"/);
  assert.match(header, /qop=auth, nc=00000001, cnonce="0a4f113b"/);
});

test('answers a 401 challenge, then reuses it with an increasing nonce count', async () => {
  const seen: (string | null)[] = [];
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    const auth = new Headers(init.headers).get('authorization');
    seen.push(auth);
    if (!auth) {
      return new Response('', {
        status: 401,
        headers: { 'www-authenticate': 'Digest realm="nvr", nonce="abc", qop="auth"' },
      });
    }
    return new Response('ok', { status: 200 });
  }) as typeof fetch;

  const client = new DigestClient('http://nvr', 'user', 'pass', fakeFetch);
  assert.equal((await client.request('/ISAPI/System/deviceInfo')).status, 200);
  assert.equal((await client.request('/ISAPI/System/deviceInfo')).status, 200);

  assert.equal(seen[0], null);
  assert.match(seen[1]!, /nc=00000001/);
  assert.match(seen[2]!, /nc=00000002/);
});
