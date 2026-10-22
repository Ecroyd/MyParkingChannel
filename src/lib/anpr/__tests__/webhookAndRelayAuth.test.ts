import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  authorizeAnprWebhook,
  buildAnprWebhookUrl,
  checkWebhookToken,
  getWebhookTokenFromRequest,
  hashWebhookToken,
} from '@/lib/anpr/webhookToken';
import {
  LEGACY_ENV_RELAY_TENANT,
  getRelayTokenFromRequest,
  matchRelayToken,
  verifyRelayToken,
  type RelayTokenSources,
} from '@/lib/anpr/relayTokenAuth';

const TENANT = '11111111-2222-3333-4444-555555555555';

describe('ANPR webhook token', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('reads token from header first, then query', () => {
    const r1 = new Request(`https://x/api/anpr/webhook?tenantId=${TENANT}&token=q`, { headers: { 'x-anpr-token': 'h' } });
    expect(getWebhookTokenFromRequest(r1)).toBe('h');
    const r2 = new Request(`https://x/api/anpr/webhook?tenantId=${TENANT}&token=q`);
    expect(getWebhookTokenFromRequest(r2)).toBe('q');
    expect(getWebhookTokenFromRequest(new Request('https://x/api/anpr/webhook'))).toBeNull();
  });

  it('checkWebhookToken decisions', () => {
    const hash = hashWebhookToken('tok');
    expect(checkWebhookToken(null, null)).toBe('unconfigured');
    expect(checkWebhookToken(null, 'anything')).toBe('unconfigured');
    expect(checkWebhookToken(hash, null)).toBe('missing');
    expect(checkWebhookToken(hash, 'nope')).toBe('invalid');
    expect(checkWebhookToken(hash, 'tok')).toBe('ok');
    expect(checkWebhookToken(hash.toUpperCase(), 'tok')).toBe('ok');
  });

  it('unconfigured tenant is accepted with a deprecation warning', async () => {
    const res = await authorizeAnprWebhook(new Request(`https://x/a?tenantId=${TENANT}`), TENANT, 'T', {
      loadHash: async () => null,
    });
    expect(res).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('configured tenant requires the token', async () => {
    const loadHash = async () => hashWebhookToken('secret');
    const denied = await authorizeAnprWebhook(new Request('https://x/a'), TENANT, 'T', { loadHash });
    expect(denied?.status).toBe(401);
    const wrong = await authorizeAnprWebhook(new Request('https://x/a?token=bad'), TENANT, 'T', { loadHash });
    expect(wrong?.status).toBe(401);
    const ok = await authorizeAnprWebhook(new Request('https://x/a?token=secret'), TENANT, 'T', { loadHash });
    expect(ok).toBeNull();
    const okHeader = await authorizeAnprWebhook(
      new Request('https://x/a', { headers: { 'x-anpr-token': 'secret' } }),
      TENANT,
      'T',
      { loadHash }
    );
    expect(okHeader).toBeNull();
  });

  it('lookup failure fails open so cameras keep working', async () => {
    const res = await authorizeAnprWebhook(new Request('https://x/a'), TENANT, 'T', {
      loadHash: async () => {
        throw new Error('db down');
      },
    });
    expect(res).toBeNull();
  });

  it('builds the URL with and without token', () => {
    expect(buildAnprWebhookUrl('https://app.test', TENANT)).toBe(`https://app.test/api/anpr/webhook?tenantId=${TENANT}`);
    expect(buildAnprWebhookUrl('https://app.test', TENANT, 'abc')).toBe(
      `https://app.test/api/anpr/webhook?tenantId=${TENANT}&token=abc`
    );
  });
});

describe('ANPR relay token auth', () => {
  const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
  const b64 = (t: string) => Buffer.from(t).toString('base64');
  const empty: RelayTokenSources = { envToken: null, site: null, secretCiphertext: null };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('prefers headers over query', () => {
    const r = new Request('https://x/a?token=q', { headers: { 'x-relay-token': 'x', authorization: 'Bearer b' } });
    expect(getRelayTokenFromRequest(r)).toBe('x');
    expect(getRelayTokenFromRequest(new Request('https://x/a?token=q', { headers: { authorization: 'Bearer b' } }))).toBe('b');
    expect(getRelayTokenFromRequest(new Request('https://x/a?token=q'))).toBe('q');
    expect(getRelayTokenFromRequest(new Request('https://x/a?token=q'), { allowQuery: false })).toBeNull();
  });

  it('matches env, anpr_sites hash and tenant_secrets', () => {
    expect(matchRelayToken('e', { ...empty, envToken: 'e' })).toBe('env');
    expect(
      matchRelayToken('s', { ...empty, site: { id: '1', tenant_id: TENANT, enabled: true, relay_token_hash: sha('s') } })
    ).toBe('anpr_sites');
    expect(matchRelayToken('t', { ...empty, secretCiphertext: b64('t') })).toBe('tenant_secrets');
    expect(matchRelayToken('x', { envToken: 'e', site: null, secretCiphertext: b64('t') })).toBeNull();
  });

  it('accepts either stored token so both rotation paths work', async () => {
    const sources: RelayTokenSources = {
      envToken: null,
      site: { id: 's1', tenant_id: TENANT, enabled: true, relay_token_hash: sha('rotated') },
      secretCiphertext: b64('generated'),
    };
    const loadSources = async () => sources;
    expect((await verifyRelayToken(TENANT, 'rotated', { loadSources })).ok).toBe(true);
    expect((await verifyRelayToken(TENANT, 'generated', { loadSources })).ok).toBe(true);
    const bad = await verifyRelayToken(TENANT, 'other', { loadSources });
    expect(bad).toMatchObject({ ok: false, status: 401 });
    expect(await verifyRelayToken(TENANT, null, { loadSources })).toMatchObject({ ok: false, status: 401 });
    expect(await verifyRelayToken('', 'x', { loadSources })).toMatchObject({ ok: false, status: 400 });
  });

  it('disabled site: anpr_sites match → 403; tenant_secrets match → 403 only when required', async () => {
    const sources: RelayTokenSources = {
      envToken: null,
      site: { id: 's1', tenant_id: TENANT, enabled: false, relay_token_hash: sha('rotated') },
      secretCiphertext: b64('generated'),
    };
    const loadSources = async () => sources;
    expect(await verifyRelayToken(TENANT, 'rotated', { loadSources })).toMatchObject({ ok: false, status: 403 });
    expect((await verifyRelayToken(TENANT, 'generated', { loadSources })).ok).toBe(true);
    expect(await verifyRelayToken(TENANT, 'generated', { loadSources, requireEnabledSite: true })).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('legacy env token works regardless of anpr_sites', async () => {
    const loadSources = async () => ({ envToken: 'envtok', site: null, secretCiphertext: null });
    expect(await verifyRelayToken(LEGACY_ENV_RELAY_TENANT, 'envtok', { loadSources, requireEnabledSite: true })).toMatchObject({
      ok: true,
      via: 'env',
    });
  });

  it('lookup error → 500', async () => {
    const r = await verifyRelayToken(TENANT, 'x', {
      loadSources: async () => {
        throw new Error('db');
      },
    });
    expect(r).toMatchObject({ ok: false, status: 500 });
  });
});
