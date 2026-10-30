// The gateway proper: live alertStream reads + catch-up after gaps → durable queue → /capture,
// plus the heartbeat. Startable and stoppable so the set-up page can restart it with new settings.

import { join } from 'node:path';
import { parseAnprNotification, type AnprRead } from './anprEvent.ts';
import { searchReads } from './catchUp.ts';
import type { GatewayConfig } from './config.ts';
import { log } from './log.ts';
import { NvrClient } from './nvr.ts';
import { resolveDirection, toCapturePayload } from './pipeline.ts';
import { ReadQueue } from './queue.ts';
import { CloudSender } from './sender.ts';

const MINUTE = 60_000;
/** Overlap added either side of a gap; the seen table makes overlap harmless. */
const CATCH_UP_MARGIN_MS = 10 * MINUTE;
/** Never search further back than this (and keep the seen table this long + a day). */
const CATCH_UP_MAX_MS = 3 * 24 * 60 * MINUTE;
/** Persist "stream alive" at most this often. */
const ALIVE_WRITE_MS = 30_000;
/** A reconnect after less than this is not treated as a gap. */
const GAP_THRESHOLD_MS = 15_000;

const STATE_LAST_ALIVE = 'last_alive_at';
const STATE_CATCH_UP_FROM = 'catch_up_from';

export type EngineStatus = {
  running: boolean;
  nvrConnected: boolean;
  lastError: string | null;
  lastRead: { plate: string; direction: string; at: string; catchUp: boolean } | null;
  readsToday: number;
  sentToday: number;
  pending: number;
  startedAt: string | null;
};

export class Engine {
  private readonly config: GatewayConfig;
  private readonly dryRun: boolean;
  private readonly nvr: NvrClient;
  private readonly sender: CloudSender;
  private queue: ReadQueue | null = null;
  private stopController = new AbortController();
  private timers: NodeJS.Timeout[] = [];
  private loop: Promise<void> | null = null;
  private draining = false;
  private catchingUp = false;
  private lastAliveWrite = 0;
  private readonly warnedChannels = new Set<string>();
  private readonly channels: number[];
  private statusDay = '';
  private readonly state: EngineStatus = {
    running: false,
    nvrConnected: false,
    lastError: null,
    lastRead: null,
    readsToday: 0,
    sentToday: 0,
    pending: 0,
    startedAt: null,
  };

  constructor(config: GatewayConfig, opts: { dryRun?: boolean } = {}) {
    this.config = config;
    this.dryRun = opts.dryRun ?? false;
    this.nvr = new NvrClient(config.nvrUrl, config.nvrUsername, config.nvrPassword);
    this.sender = new CloudSender(config);
    this.channels = [...config.channelDirections.keys()].map(Number).filter((n) => Number.isInteger(n) && n > 0);
  }

  status(): EngineStatus {
    this.rollDay();
    return { ...this.state, pending: this.queue?.pendingCount() ?? 0 };
  }

  start(): void {
    if (this.loop) return;
    const config = this.config;
    // A dry run keeps its dedupe memory in RAM and never touches the real queue.
    this.queue = new ReadQueue(this.dryRun ? ':memory:' : join(config.dataDir, 'queue.db'));
    this.stopController = new AbortController();
    Object.assign(this.state, { running: true, startedAt: new Date().toISOString(), lastError: null });

    log.info(`Gateway starting${this.dryRun ? ' (dry run: nothing is sent)' : ''}`, {
      nvr: config.nvrUrl,
      cloud: config.mpcBaseUrl,
      channels: Object.fromEntries(config.channelDirections),
      cameraDirections: Object.fromEntries(config.cameraDirections),
      deviceId: config.deviceId,
      pending: this.queue.pendingCount(),
    });
    if (config.channelDirections.size === 0 && config.cameraDirections.size === 0) {
      log.warn('No camera directions configured: every read will be skipped.');
    }
    if (this.channels.length === 0) log.warn('Catch-up disabled: it needs numeric NVR channels in the channel map.');

    this.timers.push(setInterval(() => void this.catchUp(), 5 * MINUTE));
    if (!this.dryRun) {
      this.timers.push(setInterval(() => void this.drain(), 5000));
      this.timers.push(setInterval(() => void this.sender.heartbeat(), config.heartbeatSeconds * 1000));
      this.timers.push(setInterval(() => this.queue?.pruneSeen(CATCH_UP_MAX_MS + 24 * 60 * MINUTE), 60 * MINUTE));
      void this.sender.heartbeat();
      void this.drain();
    }

    this.loop = this.nvr
      .streamForever(
        (text) => {
          const read = parseAnprNotification(text);
          if (read) this.handleRead(read);
        },
        {
          stopSignal: this.stopController.signal,
          onConnected: () => this.onConnected(),
          onActivity: () => this.markAlive(),
          onDisconnected: (err) => {
            this.state.nvrConnected = false;
            if (err) {
              this.state.lastError = /fetch failed|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|ENETUNREACH/i.test(err.message)
                ? `Can't reach the recorder at ${config.nvrUrl}. Check this computer is on the car park network.`
                : err.message;
            }
          },
        }
      )
      .catch((err) => {
        this.state.lastError = err instanceof Error ? err.message : String(err);
        log.error('Gateway loop failed', err);
      });
  }

  async stop(): Promise<void> {
    if (!this.loop) return;
    log.info('Gateway stopping');
    this.stopController.abort();
    this.timers.forEach(clearInterval);
    this.timers = [];
    await this.loop;
    this.loop = null;
    this.queue?.close();
    this.queue = null;
    Object.assign(this.state, { running: false, nvrConnected: false });
  }

  private rollDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.statusDay) {
      this.statusDay = today;
      this.state.readsToday = 0;
      this.state.sentToday = 0;
    }
  }

  /** Shared by live reads and catch-up. Returns true when the read was queued. */
  private handleRead(read: AnprRead): boolean {
    const queue = this.queue;
    if (!queue) return false;
    const direction = resolveDirection(read, this.config);
    if (!direction) {
      if (!this.warnedChannels.has(read.channelId)) {
        this.warnedChannels.add(read.channelId);
        log.warn(`Skipping reads from channel ${read.channelId} (${read.channelName ?? 'unnamed'}): no direction configured`);
      }
      return false;
    }
    if (!queue.recordRead(read.plateNorm, read.channelId, Date.parse(read.occurredAt), this.config.dedupeSeconds * 1000)) {
      return false;
    }

    this.rollDay();
    this.state.readsToday++;
    this.state.lastRead = { plate: read.plate, direction, at: read.occurredAt, catchUp: Boolean(read.raw.catchUp) };

    const payload = toCapturePayload(read, direction, this.config);
    if (this.dryRun) {
      log.info(read.raw.catchUp ? 'Would send (catch-up)' : 'Would send', payload);
    } else {
      queue.enqueue(payload);
      void this.drain();
    }
    return true;
  }

  private async drain(): Promise<void> {
    if (this.dryRun || this.draining || !this.queue) return;
    this.draining = true;
    try {
      for (;;) {
        const queue = this.queue;
        if (!queue || this.stopController.signal.aborted) break;
        const sent = await this.sender.drain(queue);
        this.rollDay();
        this.state.sentToday += sent;
        if (sent === 0) break;
      }
    } catch (err) {
      log.error('Send loop error', err);
    } finally {
      this.draining = false;
    }
  }

  private markAlive(): void {
    this.state.nvrConnected = true;
    const now = Date.now();
    if (now - this.lastAliveWrite < ALIVE_WRITE_MS) return;
    this.lastAliveWrite = now;
    this.queue?.setState(STATE_LAST_ALIVE, String(now));
  }

  private onConnected(): void {
    const queue = this.queue;
    if (!queue) return;
    this.state.nvrConnected = true;
    this.state.lastError = null;
    const now = Date.now();
    const lastAlive = Number(queue.getState(STATE_LAST_ALIVE));
    if (lastAlive > 0 && now - lastAlive > GAP_THRESHOLD_MS && this.channels.length > 0) {
      const from = Math.max(lastAlive - CATCH_UP_MARGIN_MS, now - CATCH_UP_MAX_MS);
      const pending = Number(queue.getState(STATE_CATCH_UP_FROM));
      queue.setState(STATE_CATCH_UP_FROM, String(pending > 0 ? Math.min(pending, from) : from));
      log.info(`Stream gap of ${Math.round((now - lastAlive) / 1000)}s; catching up from the NVR`);
    }
    this.lastAliveWrite = 0;
    this.markAlive();
    void this.catchUp();
  }

  private async catchUp(): Promise<void> {
    const queue = this.queue;
    const fromMs = Number(queue?.getState(STATE_CATCH_UP_FROM));
    if (!queue || this.catchingUp || !(fromMs > 0)) return;
    this.catchingUp = true;
    const to = new Date(Date.now() + CATCH_UP_MARGIN_MS);
    try {
      const reads = await searchReads(this.nvr.http, new Date(fromMs), to, this.channels);
      let recovered = 0;
      for (const read of reads) if (this.handleRead(read)) recovered++;
      // Only clear what was covered; a newer gap may have been recorded meanwhile.
      if (this.queue && Number(this.queue.getState(STATE_CATCH_UP_FROM)) === fromMs) {
        this.queue.setState(STATE_CATCH_UP_FROM, '0');
      }
      log.info(`Catch-up ${new Date(fromMs).toISOString()} → now: ${reads.length} stored reads, ${recovered} were missed and are now queued`);
    } catch (err) {
      log.warn('Catch-up search failed; will retry', err);
    } finally {
      this.catchingUp = false;
    }
  }
}
