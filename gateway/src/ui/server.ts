// Local set-up / status server for the gateway app. Listens on 127.0.0.1 only. Every API call
// must carry the x-mpc-gateway header and a localhost Host/Origin: a header that browsers only
// send after a CORS preflight (which this server never approves) stops other web pages from
// driving it, and the Host check stops DNS-rebinding.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { hostname } from 'node:os';
import { countStoredReads } from '../catchUp.ts';
import { configFromSettings, DEFAULT_MPC_BASE_URL, type Direction } from '../config.ts';
import { Engine } from '../engine.ts';
import { log } from '../log.ts';
import { NvrClient } from '../nvr.ts';
import { isComplete, loadSettings, saveSettings, type PartialSettings } from '../settings.ts';
import { PAGE_HTML } from './page.ts';

export const UI_PORT = 5719;
const MAX_BODY = 64 * 1024;

export type AppContext = {
  dataDir: string;
  port: number;
  /** Running from the Windows startup task. */
  service: boolean;
  /** Offer "Run in the background" (Windows, not already the service). */
  canInstall: boolean;
  install: () => Promise<void>;
  dryRun: boolean;
};

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class GatewayApp {
  private readonly ctx: AppContext;
  private engine: Engine | null = null;
  private server: Server | null = null;

  constructor(ctx: AppContext) {
    this.ctx = ctx;
  }

  private settings(): PartialSettings {
    return loadSettings(this.ctx.dataDir) ?? {};
  }

  /** (Re)start the engine from saved settings; stop it when they are incomplete. */
  async applySettings(): Promise<void> {
    await this.engine?.stop();
    this.engine = null;
    const s = this.settings();
    if (!isComplete(s)) return;
    this.engine = new Engine(configFromSettings(s, this.ctx.dataDir), { dryRun: this.ctx.dryRun });
    this.engine.start();
  }

  async stopEngine(): Promise<void> {
    await this.engine?.stop();
    this.engine = null;
  }

  phase(s: PartialSettings): 'pair' | 'nvr' | 'cameras' | 'running' {
    if (!s.tenantId || !s.deviceKey) return 'pair';
    if (!s.nvrUrl || !s.nvrUsername || !s.nvrPassword) return 'nvr';
    if (!s.channelDirections || Object.keys(s.channelDirections).length === 0) return 'cameras';
    return 'running';
  }

  /** Start listening; resolves false when another gateway already owns the port. */
  listen(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => void this.handle(req, res));
      server.once('error', (err: NodeJS.ErrnoException) => (err.code === 'EADDRINUSE' ? resolve(false) : reject(err)));
      server.listen(this.ctx.port, '127.0.0.1', () => {
        this.server = server;
        log.info(`Set-up page: http://127.0.0.1:${this.ctx.port}`);
        resolve(true);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const host = (req.headers.host ?? '').toLowerCase();
      if (host !== `127.0.0.1:${this.ctx.port}` && host !== `localhost:${this.ctx.port}`) {
        throw new HttpError(403, 'Forbidden');
      }
      const url = new URL(req.url ?? '/', `http://${host}`);

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-frame-options': 'DENY',
          'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        });
        res.end(PAGE_HTML);
        return;
      }

      if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'Not found');
      if (req.headers['x-mpc-gateway'] !== '1') throw new HttpError(403, 'Forbidden');
      const origin = req.headers.origin;
      if (origin && origin !== `http://127.0.0.1:${this.ctx.port}` && origin !== `http://localhost:${this.ctx.port}`) {
        throw new HttpError(403, 'Forbidden');
      }

      const body = req.method === 'POST' ? await readJson(req) : null;
      const result = await this.route(req.method ?? 'GET', url.pathname, body);
      sendJson(res, 200, result);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) log.error('Set-up page error', err);
      sendJson(res, status, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async route(method: string, path: string, body: Record<string, unknown> | null): Promise<unknown> {
    const s = this.settings();

    if (method === 'GET' && path === '/api/state') {
      return {
        phase: this.phase(s),
        settings: {
          tenantName: s.tenantName ?? null,
          mpcBaseUrl: s.mpcBaseUrl ?? DEFAULT_MPC_BASE_URL,
          nvrUrl: s.nvrUrl ?? null,
          nvrUsername: s.nvrUsername ?? null,
          hasNvrPassword: Boolean(s.nvrPassword),
          channelDirections: s.channelDirections ?? {},
        },
        status: this.engine?.status() ?? null,
        service: this.ctx.service,
        canInstall: this.ctx.canInstall,
      };
    }

    if (method === 'POST' && path === '/api/pair') {
      const code = String(body?.code ?? '').trim();
      if (!code) throw new HttpError(400, 'Enter the pairing code');
      const base = String(body?.mpcBaseUrl || s.mpcBaseUrl || DEFAULT_MPC_BASE_URL).replace(/\/+$/, '');
      const res = await fetch(`${base}/api/gateway/pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name: hostname() }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => {
        throw new HttpError(502, 'Could not reach My Parking Channel. Check this computer is online.');
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, string>;
      if (!res.ok) {
        throw new HttpError(
          400,
          json.error ||
            (res.status === 404
              ? 'My Parking Channel did not recognise the pairing request. It may need updating first.'
              : `Pairing failed (HTTP ${res.status}). Please try again.`)
        );
      }

      await this.stopEngine();
      saveSettings(this.ctx.dataDir, {
        ...s,
        mpcBaseUrl: base,
        tenantId: json.tenantId,
        tenantName: json.tenantName ?? null,
        deviceId: json.deviceId,
        deviceKey: json.deviceKey,
      });
      log.info(`Paired with ${json.tenantName ?? json.tenantId}`);
      await this.applySettings();
      return { ok: true };
    }

    if (method === 'POST' && path === '/api/nvr') {
      if (this.phase(s) === 'pair') throw new HttpError(400, 'Connect to My Parking Channel first');
      // An empty body re-lists cameras with the saved login.
      const nvrUrl = normaliseNvrUrl(String(body?.url || s.nvrUrl || ''));
      const nvrUsername = String(body?.username || s.nvrUsername || '').trim();
      const nvrPassword = String(body?.password || s.nvrPassword || '');
      if (!nvrUrl || !nvrUsername || !nvrPassword) throw new HttpError(400, 'Enter the recorder address, username and password');

      const nvr = new NvrClient(nvrUrl, nvrUsername, nvrPassword);
      const device = await nvr.deviceInfo().catch((e: Error) => {
        throw new HttpError(400, /rejected/.test(e.message) ? e.message : `Could not reach the recorder at ${nvrUrl}: ${e.message}`);
      });
      const channels = await nvr.channels().catch((e: Error) => {
        throw new HttpError(400, `Signed in, but could not list cameras (${e.message}). Give the recorder user more permissions.`);
      });

      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
      const counted = await Promise.all(
        channels.map(async (c) => ({
          ...c,
          reads7d: await countStoredReads(nvr.http, from, to, Number(c.id)).catch(() => 0),
        }))
      );

      if (body?.url || body?.username || body?.password) {
        await this.stopEngine();
        saveSettings(this.ctx.dataDir, { ...this.settings(), nvrUrl, nvrUsername, nvrPassword });
        await this.applySettings();
      }
      return { device, channels: counted.sort((a, b) => b.reads7d - a.reads7d || Number(a.id) - Number(b.id)) };
    }

    if (method === 'POST' && path === '/api/cameras') {
      const raw = (body?.channelDirections ?? {}) as Record<string, unknown>;
      const channelDirections: Record<string, Direction> = {};
      for (const [id, dir] of Object.entries(raw)) {
        if (!/^\d+$/.test(id)) continue;
        if (dir === 'in' || dir === 'out') channelDirections[id] = dir;
      }
      if (Object.keys(channelDirections).length === 0) throw new HttpError(400, 'Set at least one camera to Entry or Exit');
      await this.stopEngine();
      saveSettings(this.ctx.dataDir, { ...this.settings(), channelDirections });
      log.info('Cameras saved', channelDirections);
      await this.applySettings();
      return { ok: true };
    }

    if (method === 'POST' && path === '/api/install') {
      if (!this.ctx.canInstall) throw new HttpError(400, 'Background mode is only available on Windows');
      if (!isComplete(this.settings())) throw new HttpError(400, 'Finish set-up first');
      await this.ctx.install();
      return { ok: true };
    }

    throw new HttpError(404, 'Not found');
  }
}

function normaliseNvrUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
      } catch {
        reject(new HttpError(400, 'Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
