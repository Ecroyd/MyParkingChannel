// Talk to the Hikvision NVR over ISAPI: device info, and the long-lived alertStream that
// pushes every event (including ANPR plate reads) from all channels.

import { DigestClient } from './digest.ts';
import { log } from './log.ts';
import { boundaryFromContentType, MultipartParser, type MultipartPart } from './multipart.ts';

export const ALERT_STREAM_PATH = '/ISAPI/Event/notification/alertStream';

export class NvrClient {
  readonly http: DigestClient;

  constructor(baseUrl: string, username: string, password: string, fetchImpl: typeof fetch = fetch) {
    this.http = new DigestClient(baseUrl, username, password, fetchImpl);
  }

  async deviceInfo(): Promise<{ model: string | null; firmware: string | null; name: string | null }> {
    const res = await this.http.request('/ISAPI/System/deviceInfo', { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`deviceInfo returned HTTP ${res.status}`);
    const xml = await res.text();
    const tag = (n: string) => new RegExp(`<${n}>([^<]*)</${n}>`).exec(xml)?.[1] ?? null;
    return { model: tag('model'), firmware: tag('firmwareVersion'), name: tag('deviceName') };
  }

  /**
   * Hold one alertStream connection open and call onText for every XML/JSON part (images are
   * skipped). Resolves when the stream ends or goes quiet for longer than idleMs; throws on
   * HTTP errors. The caller reconnects.
   */
  async streamOnce(onText: (text: string, part: MultipartPart) => void, idleMs = 120_000): Promise<void> {
    const controller = new AbortController();
    const res = await this.http.request(ALERT_STREAM_PATH, { signal: controller.signal });
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      throw new Error(`alertStream returned HTTP ${res.status}`);
    }

    const parser = new MultipartParser(boundaryFromContentType(res.headers.get('content-type')) ?? 'boundary');
    let idle = setTimeout(() => controller.abort(), idleMs);
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        clearTimeout(idle);
        idle = setTimeout(() => controller.abort(), idleMs);
        for (const part of parser.push(chunk)) {
          const type = (part.headers['content-type'] ?? '').toLowerCase();
          if (type.startsWith('image/')) continue;
          onText(part.body.toString('utf8'), part);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) throw err;
      log.warn(`alertStream silent for ${idleMs / 1000}s; reconnecting`);
    } finally {
      clearTimeout(idle);
    }
  }

  /** Reconnect forever with backoff (2s doubling to 60s; reset after a healthy connection). */
  async streamForever(onText: (text: string) => void, shouldStop: () => boolean): Promise<void> {
    let delay = 2000;
    while (!shouldStop()) {
      const startedAt = Date.now();
      try {
        log.info('Connecting to NVR alertStream');
        await this.streamOnce((text) => onText(text));
        log.warn('alertStream ended; reconnecting');
      } catch (err) {
        log.error('alertStream error', err);
      }
      if (Date.now() - startedAt > 60_000) delay = 2000;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(60_000, delay * 2);
    }
  }
}
