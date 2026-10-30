// Deliver queued reads to My Parking Channel (POST /api/internal/anpr/capture) and keep the
// gateway's gate device marked connected (POST /api/internal/anpr/heartbeat).

import type { GatewayConfig } from './config.ts';
import { log } from './log.ts';
import type { CapturePayload, ReadQueue } from './queue.ts';

export type SendOutcome =
  | { kind: 'sent'; duplicate: boolean; result?: string; bookingId?: string | null }
  | { kind: 'retry'; error: string }
  | { kind: 'reject'; error: string };

/**
 * 2xx → sent. 400 → the read itself is bad: reject (park it). Everything else — network,
 * 401/403/404 (token, site or device misconfigured), 429, 5xx — is retried: a config problem
 * must not throw reads away while it is being fixed.
 */
export function classifyResponse(status: number, body: unknown): SendOutcome {
  const b = (body ?? {}) as Record<string, unknown>;
  const error = typeof b.error === 'string' ? b.error : `HTTP ${status}`;
  if (status >= 200 && status < 300) {
    return {
      kind: 'sent',
      duplicate: b.duplicate === true,
      result: typeof b.result === 'string' ? b.result : undefined,
      bookingId: typeof b.bookingId === 'string' ? b.bookingId : null,
    };
  }
  if (status === 400) return { kind: 'reject', error };
  return { kind: 'retry', error: `${status}: ${error}` };
}

export class CloudSender {
  private readonly config: GatewayConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: GatewayConfig, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  private url(path: string): string {
    return `${this.config.mpcBaseUrl}/api/internal/anpr/${path}?tenantId=${encodeURIComponent(this.config.tenantId)}`;
  }

  private async post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
    const res = await this.fetchImpl(this.url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relay-token': this.config.relayToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  async sendCapture(payload: CapturePayload): Promise<SendOutcome> {
    try {
      const { status, json } = await this.post('capture', payload);
      return classifyResponse(status, json);
    } catch (err) {
      return { kind: 'retry', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Send everything that is due; returns how many reads were delivered. */
  async drain(queue: ReadQueue, batch = 25): Promise<number> {
    let delivered = 0;
    for (const item of queue.due(batch)) {
      const outcome = await this.sendCapture(item.payload);
      const label = `${item.payload.plate} ${item.payload.direction} @ ${item.payload.occurred_at}`;
      if (outcome.kind === 'sent') {
        queue.done(item.id);
        delivered++;
        log.info(
          `Sent ${label}`,
          outcome.duplicate ? 'duplicate' : { result: outcome.result, bookingId: outcome.bookingId }
        );
      } else if (outcome.kind === 'reject') {
        queue.bury(item.id, outcome.error);
        log.error(`Rejected ${label}; parked in dead table`, outcome.error);
      } else {
        queue.retry(item.id, item.attempts, outcome.error);
        log.warn(`Send failed for ${label}; will retry`, outcome.error);
        break; // Keep order and avoid hammering a failing endpoint.
      }
    }
    return delivered;
  }

  async heartbeat(): Promise<void> {
    if (!this.config.deviceId) return;
    try {
      const { status, json } = await this.post('heartbeat', { device_id: this.config.deviceId });
      if (status !== 200) log.warn(`Heartbeat failed (${status})`, json);
    } catch (err) {
      log.warn('Heartbeat failed', err);
    }
  }
}
