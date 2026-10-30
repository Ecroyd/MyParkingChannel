// Talk to the Hikvision NVR over ISAPI: device info, the camera list, and the long-lived
// alertStream that pushes every event (including ANPR plate reads) from all channels.

import { DigestClient } from './digest.ts';
import { log } from './log.ts';
import { boundaryFromContentType, MultipartParser, type MultipartPart } from './multipart.ts';

export const ALERT_STREAM_PATH = '/ISAPI/Event/notification/alertStream';
export const CHANNELS_PATH = '/ISAPI/ContentMgmt/InputProxy/channels';

export type StreamHooks = {
  /** The NVR accepted the stream request: anything missed before this is a gap. */
  onConnected?: () => void;
  /** Bytes arrived: the stream is alive. */
  onActivity?: () => void;
  /** The connection ended; error is set when it failed. */
  onDisconnected?: (error: Error | null) => void;
  /** Aborting it ends the stream (and streamForever) promptly. */
  stopSignal?: AbortSignal;
};

export type NvrChannel = { id: string; name: string; ipAddress: string | null };

/** <InputProxyChannelList><InputProxyChannel><id>1</id><name>camera 1</name>… */
export function parseChannelList(xml: string): NvrChannel[] {
  const channels: NvrChannel[] = [];
  const blocks = xml.match(/<InputProxyChannel(?:\s[^>]*)?>[\s\S]*?<\/InputProxyChannel>/g) ?? [];
  for (const block of blocks) {
    const tag = (n: string) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(block)?.[1]?.trim() ?? null;
    const id = tag('id');
    if (id) channels.push({ id, name: tag('name') ?? `Camera ${id}`, ipAddress: tag('ipAddress') });
  }
  return channels;
}

export class NvrClient {
  readonly http: DigestClient;

  constructor(baseUrl: string, username: string, password: string, fetchImpl: typeof fetch = fetch) {
    this.http = new DigestClient(baseUrl, username, password, fetchImpl);
  }

  async deviceInfo(): Promise<{ model: string | null; firmware: string | null; name: string | null }> {
    const res = await this.http.request('/ISAPI/System/deviceInfo', { signal: AbortSignal.timeout(15_000) });
    if (res.status === 401) throw new Error('The NVR rejected the username or password');
    if (!res.ok) throw new Error(`deviceInfo returned HTTP ${res.status}`);
    const xml = await res.text();
    const tag = (n: string) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(xml)?.[1] ?? null;
    return { model: tag('model'), firmware: tag('firmwareVersion'), name: tag('deviceName') };
  }

  async channels(): Promise<NvrChannel[]> {
    const res = await this.http.request(CHANNELS_PATH, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Camera list returned HTTP ${res.status}`);
    return parseChannelList(await res.text());
  }

  /**
   * Hold one alertStream connection open and call onText for every XML/JSON part (images are
   * skipped). Resolves when the stream ends, goes quiet for longer than idleMs, or is stopped;
   * throws on HTTP errors. The caller reconnects.
   */
  async streamOnce(
    onText: (text: string, part: MultipartPart) => void,
    idleMs = 120_000,
    hooks: StreamHooks = {}
  ): Promise<void> {
    const controller = new AbortController();
    const onStop = () => controller.abort();
    hooks.stopSignal?.addEventListener('abort', onStop);
    let idle: NodeJS.Timeout | undefined;
    try {
      const res = await this.http.request(ALERT_STREAM_PATH, { signal: controller.signal });
      if (!res.ok || !res.body) {
        await res.body?.cancel();
        throw new Error(
          res.status === 401 ? 'The NVR rejected the username or password' : `alertStream returned HTTP ${res.status}`
        );
      }
      hooks.onConnected?.();

      const parser = new MultipartParser(boundaryFromContentType(res.headers.get('content-type')) ?? 'boundary');
      idle = setTimeout(() => controller.abort(), idleMs);
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        clearTimeout(idle);
        idle = setTimeout(() => controller.abort(), idleMs);
        hooks.onActivity?.();
        for (const part of parser.push(chunk)) {
          const type = (part.headers['content-type'] ?? '').toLowerCase();
          if (type.startsWith('image/')) continue;
          onText(part.body.toString('utf8'), part);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) throw err;
      if (!hooks.stopSignal?.aborted) log.warn(`alertStream silent for ${idleMs / 1000}s; reconnecting`);
    } finally {
      clearTimeout(idle);
      hooks.stopSignal?.removeEventListener('abort', onStop);
    }
  }

  /** Reconnect until stopped, with backoff (2s doubling to 60s; reset after a healthy connection). */
  async streamForever(onText: (text: string) => void, hooks: StreamHooks = {}): Promise<void> {
    const stopped = () => hooks.stopSignal?.aborted === true;
    let delay = 2000;
    while (!stopped()) {
      const startedAt = Date.now();
      try {
        log.info('Connecting to NVR alertStream');
        await this.streamOnce((text) => onText(text), undefined, hooks);
        if (!stopped()) log.warn('alertStream ended; reconnecting');
        hooks.onDisconnected?.(null);
      } catch (err) {
        log.error('alertStream error', err);
        hooks.onDisconnected?.(err instanceof Error ? err : new Error(String(err)));
      }
      if (stopped()) break;
      if (Date.now() - startedAt > 60_000) delay = 2000;
      await sleep(delay, hooks.stopSignal);
      delay = Math.min(60_000, delay * 2);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done);
  });
}
