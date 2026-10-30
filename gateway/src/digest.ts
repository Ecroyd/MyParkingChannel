// HTTP Digest authentication (RFC 7616, MD5 / qop=auth) — what Hikvision ISAPI requires.
// No dependencies: the challenge is cached and reused with an increasing nonce count, and
// re-fetched when the device answers 401 again (expired or stale nonce).

import { createHash, randomBytes } from 'node:crypto';

export type DigestChallenge = {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
};

export function parseDigestChallenge(header: string | null): DigestChallenge | null {
  if (!header || !/^\s*digest\s/i.test(header)) return null;
  const params: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|([^\s,]+))/g;
  for (let m = re.exec(header); m; m = re.exec(header)) {
    params[m[1].toLowerCase()] = m[2] ?? m[3];
  }
  if (!params.realm || !params.nonce) return null;
  return {
    realm: params.realm,
    nonce: params.nonce,
    qop: params.qop,
    opaque: params.opaque,
    algorithm: params.algorithm,
  };
}

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

export function buildDigestAuthorization(opts: {
  challenge: DigestChallenge;
  username: string;
  password: string;
  method: string;
  uri: string;
  nc: number;
  cnonce: string;
}): string {
  const { challenge, username, password, method, uri, nc, cnonce } = opts;
  const ha1 = md5(`${username}:${challenge.realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const ncHex = nc.toString(16).padStart(8, '0');
  const useQop = challenge.qop?.split(',').map((q) => q.trim()).includes('auth');
  const response = useQop
    ? md5(`${ha1}:${challenge.nonce}:${ncHex}:${cnonce}:auth:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  if (useQop) parts.push('qop=auth', `nc=${ncHex}`, `cnonce="${cnonce}"`);
  return `Digest ${parts.join(', ')}`;
}

export class DigestClient {
  private challenge: DigestChallenge | null = null;
  private nc = 0;
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl: string, username: string, password: string, fetchImpl: typeof fetch = fetch) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
    this.fetchImpl = fetchImpl;
  }

  private authHeader(method: string, uri: string): string | null {
    if (!this.challenge) return null;
    this.nc += 1;
    return buildDigestAuthorization({
      challenge: this.challenge,
      username: this.username,
      password: this.password,
      method,
      uri,
      nc: this.nc,
      cnonce: randomBytes(8).toString('hex'),
    });
  }

  /** `path` is the request URI, e.g. "/ISAPI/System/deviceInfo". */
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const send = (auth: string | null) => {
      const headers = new Headers(init.headers);
      if (auth) headers.set('Authorization', auth);
      return this.fetchImpl(this.baseUrl + path, { ...init, method, headers });
    };

    let res = await send(this.authHeader(method, path));
    if (res.status !== 401) return res;

    const challenge = parseDigestChallenge(res.headers.get('www-authenticate'));
    if (!challenge) return res;
    await res.body?.cancel();
    this.challenge = challenge;
    this.nc = 0;
    res = await send(this.authHeader(method, path));
    return res;
  }
}
