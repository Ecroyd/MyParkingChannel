// The gateway proper: plate reads → durable queue → /capture, plus the heartbeat. Reads come
// three ways, all deduplicated by the queue's seen table:
//   - the sweep: every minute, search the NVR's stored reads for the last few minutes. This is
//     the dependable path (the search format is verified on the site NVR; the live stream did not
//     deliver plates there), at the cost of up to a minute's delay;
//   - the live alertStream, instant when the NVR pushes plate events;
//   - catch-up after a gap (PC off or asleep, network drop), for up to 3 days back. Startable and stoppable so the set-up page can restart it with new settings.

import { join } from 'node:path';
import { parseAnprNotification, type AnprRead } from './anprEvent.ts';
import { searchReads } from './catchUp.ts';
import type { GatewayConfig } from './config.ts';
import { log } from './log.ts';
import { NvrClient } from './nvr.ts';
import { countDirection, resolveDirection, toCapturePayload, type DirectionCounts } from './pipeline.ts';
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
const SWEEP_EVERY_MS = 60_000;
/**
 * Each sweep re-reads this far before the previous one and this far past now, so reads the NVR
 * files late, or an NVR clock a few minutes off this PC's, are still caught. Repeats are dropped.
 */
const SWEEP_BEFORE_MS = 15 * MINUTE;
const SWEEP_AFTER_MS = 10 * MINUTE;

const STATE_LAST_ALIVE = 'last_alive_at';
const STATE_CATCH_UP_FROM = 'catch_up_from';
const STATE_SWEPT_UNTIL = 'swept_until';
const STATE_DIRECTION_COUNTS = 'camera_direction_counts';

export type EngineStatus = {
  running: boolean;
  nvrConnected: boolean;
  lastError: string | null;
  lastRead: { plate: string; direction: string; at: string; catchUp: boolean } | null;
  readsToday: number;
  sentToday: number;
  pending: number;
  startedAt: string | null;
  /** The most recent catch-up search after a gap. */
  lastCatchUp: { at: string; reads: number; queued: number } | null;
  catchUpError: string | null;
  /** Reads waiting for a catch-up search (a gap was seen and not yet searched). */
  catchUpPending: boolean;
  /** NVR channel -> direction, as configured. */
  cameras: Record<string, string>;
  /** The last successful sweep of the NVR's stored reads. */
  lastSweepAt: string | null;
  sweepError: string | null;
};

/** Status pushes on recorder connect/disconnect, at most this often. */
const STATUS_PUSH_MS = 30_000;

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
  private sweeping = false;
  private lastAliveWrite = 0;
  private readonly warnedChannels = new Set<string>();
  private readonly channels: number[];
  private statusDay = '';
  private lastStatusPush = 0;
  private readonly state: EngineStatus = {
    running: false,
    nvrConnected: false,
    lastError: null,
    lastRead: null,
    readsToday: 0,
    sentToday: 0,
    pending: 0,
    startedAt: null,
    lastCatchUp: null,
    catchUpError: null,
    catchUpPending: false,
    cameras: {},
    lastSweepAt: null,
    sweepError: null,
  };

  /** Extra fields for the status (and heartbeat), e.g. the allow-list sync's. */
  private readonly extraStatus: () => Record<string, unknown>;

  constructor(config: GatewayConfig, opts: { dryRun?: boolean; extraStatus?: () => Record<string, unknown> } = {}) {
    this.config = config;
    this.dryRun = opts.dryRun ?? false;
    this.extraStatus = opts.extraStatus ?? (() => ({}));
    this.nvr = new NvrClient(config.nvrUrl, config.nvrUsername, config.nvrPassword);
    this.sender = new CloudSender(config);
    this.channels = [...config.channelDirections.keys()].map(Number).filter((n) => Number.isInteger(n) && n > 0);
    this.state.cameras = Object.fromEntries(config.channelDirections);
  }

  status(): EngineStatus & Record<string, unknown> {
    this.rollDay();
    return {
      ...this.extraStatus(),
      ...this.state,
      pending: this.queue?.pendingCount() ?? 0,
      catchUpPending: Number(this.queue?.getState(STATE_CATCH_UP_FROM)) > 0,
    };
  }

  /** For the allow-list sync, which uses the same My Parking Channel credentials. */
  cloud(): CloudSender {
    return this.sender;
  }

  private heartbeat(): void {
    if (this.dryRun) return;
    this.lastStatusPush = Date.now();
    void this.sender.heartbeat(this.status());
  }

  /** Tell My Parking Channel promptly when the recorder connection changes. */
  private pushStatus(): void {
    if (Date.now() - this.lastStatusPush >= STATUS_PUSH_MS) this.heartbeat();
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
    this.timers.push(setInterval(() => void this.sweep(), SWEEP_EVERY_MS));
    void this.sweep();
    if (!this.dryRun) {
      this.timers.push(setInterval(() => void this.drain(), 5000));
      this.timers.push(setInterval(() => this.heartbeat(), config.heartbeatSeconds * 1000));
      this.timers.push(setInterval(() => this.queue?.pruneSeen(CATCH_UP_MAX_MS + 24 * 60 * MINUTE), 60 * MINUTE));
      this.heartbeat();
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
            this.pushStatus();
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

  private directionCountsCache: DirectionCounts | null = null;

  /** Per-camera forward/reverse counts, kept in the queue database so they survive restarts. */
  private directionCounts(queue: NonNullable<typeof this.queue>): DirectionCounts {
    if (!this.directionCountsCache) {
      try {
        this.directionCountsCache = JSON.parse(queue.getState(STATE_DIRECTION_COUNTS) ?? '{}') as DirectionCounts;
      } catch {
        this.directionCountsCache = {};
      }
    }
    return this.directionCountsCache;
  }

  /** Shared by live reads and catch-up. Returns true when the read was queued. */
  private handleRead(read: AnprRead): boolean {
    const queue = this.queue;
    if (!queue) return false;
    const counts = this.directionCounts(queue);
    const direction = resolveDirection(read, this.config, counts);
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
    if (read.cameraDirection) {
      countDirection(counts, read);
      queue.setState(STATE_DIRECTION_COUNTS, JSON.stringify(counts));
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
    this.pushStatus();
    void this.catchUp();
  }

  /**
   * Search the NVR's stored reads since the last sweep. The first sweep of an existing install
   * starts from its oldest remembered read, so reads the live stream missed since set-up are
   * recovered; a new install starts from now.
   */
  async sweep(nowMs = Date.now()): Promise<void> {
    const queue = this.queue;
    if (!queue || this.sweeping || this.channels.length === 0) return;
    this.sweeping = true;
    try {
      let from = Number(queue.getState(STATE_SWEPT_UNTIL));
      if (!(from > 0)) from = (queue.earliestSeen() ?? nowMs) - CATCH_UP_MARGIN_MS;
      from = Math.max(from - SWEEP_BEFORE_MS, nowMs - CATCH_UP_MAX_MS);
      const reads = await searchReads(this.nvr.http, new Date(from), new Date(nowMs + SWEEP_AFTER_MS), this.channels);
      let queued = 0;
      for (const read of reads) {
        delete read.raw.catchUp;
        read.raw.sweep = 'true';
        if (this.handleRead(read)) queued++;
      }
      if (this.queue) this.queue.setState(STATE_SWEPT_UNTIL, String(nowMs));
      if (queued > 0) log.info(`Sweep: ${queued} new plate reads from the NVR`);
      this.state.lastSweepAt = new Date(nowMs).toISOString();
      this.state.sweepError = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (this.state.sweepError !== message) log.warn('Sweep of the NVR\'s stored reads failed; will retry', message);
      this.state.sweepError = message;
    } finally {
      this.sweeping = false;
    }
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
      this.state.lastCatchUp = { at: new Date().toISOString(), reads: reads.length, queued: recovered };
      this.state.catchUpError = null;
    } catch (err) {
      this.state.catchUpError = err instanceof Error ? err.message : String(err);
      log.warn('Catch-up search failed; will retry', err);
    } finally {
      this.catchingUp = false;
    }
  }
}
