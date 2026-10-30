// My Parking Channel ANPR gateway.
//
//   node src/main.ts run            stream plate reads from the NVR to My Parking Channel
//   node src/main.ts run --dry-run  same, but only log what would be sent
//   node src/main.ts probe [secs]   record raw NVR events to data/ (default 120s) and test the
//                                   catch-up search; sends nothing

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnprNotification, type AnprRead } from './anprEvent.ts';
import { searchReads } from './catchUp.ts';
import { loadConfig, type GatewayConfig } from './config.ts';
import { initLogFile, log } from './log.ts';
import { NvrClient } from './nvr.ts';
import { resolveDirection, toCapturePayload } from './pipeline.ts';
import { ReadQueue } from './queue.ts';
import { CloudSender } from './sender.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

async function checkNvr(nvr: NvrClient): Promise<void> {
  try {
    log.info('NVR reachable', await nvr.deviceInfo());
  } catch (err) {
    log.error('NVR not reachable yet (will keep trying via the stream)', err);
  }
}

/** Channels to search: the numeric keys of CHANNEL_DIRECTIONS. */
function catchUpChannels(config: GatewayConfig): number[] {
  return [...config.channelDirections.keys()].map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

async function run(config: GatewayConfig, dryRun: boolean): Promise<void> {
  const nvr = new NvrClient(config.nvrUrl, config.nvrUsername, config.nvrPassword);
  // A dry run keeps its dedupe memory in RAM and never touches the real queue.
  const queue = new ReadQueue(dryRun ? ':memory:' : join(config.dataDir, 'queue.db'));
  const sender = new CloudSender(config);
  const warnedChannels = new Set<string>();
  const channels = catchUpChannels(config);
  let stopping = false;

  log.info(`Gateway starting${dryRun ? ' (dry run: nothing is sent)' : ''}`, {
    nvr: config.nvrUrl,
    cloud: config.mpcBaseUrl,
    channels: Object.fromEntries(config.channelDirections),
    cameraDirections: Object.fromEntries(config.cameraDirections),
    deviceId: config.deviceId,
    pending: queue.pendingCount(),
  });
  if (config.channelDirections.size === 0 && config.cameraDirections.size === 0) {
    log.warn('No CHANNEL_DIRECTIONS or CAMERA_DIRECTIONS set: every read will be skipped. Run probe first.');
  }
  if (channels.length === 0) {
    log.warn('Catch-up disabled: it needs numeric NVR channels in CHANNEL_DIRECTIONS.');
  }
  await checkNvr(nvr);

  let draining = false;
  const drain = async () => {
    if (dryRun || draining) return;
    draining = true;
    try {
      while ((await sender.drain(queue)) > 0 && !stopping) {
        // keep going while reads are being delivered
      }
    } finally {
      draining = false;
    }
  };

  /** Shared by live reads and catch-up. Returns true when the read was queued. */
  const handleRead = (read: AnprRead): boolean => {
    const direction = resolveDirection(read, config);
    if (!direction) {
      if (!warnedChannels.has(read.channelId)) {
        warnedChannels.add(read.channelId);
        log.warn(`Skipping reads from channel ${read.channelId} (${read.channelName ?? 'unnamed'}): no direction configured`);
      }
      return false;
    }
    if (!queue.recordRead(read.plateNorm, read.channelId, Date.parse(read.occurredAt), config.dedupeSeconds * 1000)) {
      return false;
    }

    const payload = toCapturePayload(read, direction, config);
    if (dryRun) {
      log.info(read.raw.catchUp ? 'Would send (catch-up)' : 'Would send', payload);
    } else {
      queue.enqueue(payload);
      void drain();
    }
    return true;
  };

  // --- Catch-up ------------------------------------------------------------------------------
  let lastAliveWrite = 0;
  const markAlive = () => {
    const now = Date.now();
    if (now - lastAliveWrite < ALIVE_WRITE_MS) return;
    lastAliveWrite = now;
    queue.setState(STATE_LAST_ALIVE, String(now));
  };

  const onConnected = () => {
    const now = Date.now();
    const lastAlive = Number(queue.getState(STATE_LAST_ALIVE));
    if (lastAlive > 0 && now - lastAlive > GAP_THRESHOLD_MS && channels.length > 0) {
      const from = Math.max(lastAlive - CATCH_UP_MARGIN_MS, now - CATCH_UP_MAX_MS);
      const pending = Number(queue.getState(STATE_CATCH_UP_FROM));
      queue.setState(STATE_CATCH_UP_FROM, String(pending > 0 ? Math.min(pending, from) : from));
      log.info(`Stream gap of ${Math.round((now - lastAlive) / 1000)}s; catching up from the NVR`);
    }
    lastAliveWrite = 0;
    markAlive();
    void catchUp();
  };

  let catchingUp = false;
  const catchUp = async () => {
    const fromMs = Number(queue.getState(STATE_CATCH_UP_FROM));
    if (catchingUp || !(fromMs > 0)) return;
    catchingUp = true;
    const to = new Date(Date.now() + CATCH_UP_MARGIN_MS);
    try {
      const reads = await searchReads(nvr.http, new Date(fromMs), to, channels);
      let recovered = 0;
      for (const read of reads) if (handleRead(read)) recovered++;
      // Only clear what was covered; a newer gap may have been recorded meanwhile.
      if (Number(queue.getState(STATE_CATCH_UP_FROM)) === fromMs) queue.setState(STATE_CATCH_UP_FROM, '0');
      log.info(`Catch-up ${new Date(fromMs).toISOString()} → now: ${reads.length} stored reads, ${recovered} were missed and are now queued`);
    } catch (err) {
      log.warn('Catch-up search failed; will retry', err);
    } finally {
      catchingUp = false;
    }
  };

  // --- Timers --------------------------------------------------------------------------------
  const timers: NodeJS.Timeout[] = [setInterval(() => void catchUp(), 5 * MINUTE)];
  if (!dryRun) {
    timers.push(setInterval(() => void drain(), 5000));
    timers.push(setInterval(() => void sender.heartbeat(), config.heartbeatSeconds * 1000));
    timers.push(setInterval(() => queue.pruneSeen(CATCH_UP_MAX_MS + 24 * 60 * MINUTE), 60 * MINUTE));
    void sender.heartbeat();
  }

  const stop = () => {
    if (stopping) return;
    stopping = true;
    log.info('Stopping');
    timers.forEach(clearInterval);
    queue.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  await nvr.streamForever(
    (text) => {
      const read = parseAnprNotification(text);
      if (read) handleRead(read);
    },
    () => stopping,
    { onConnected, onActivity: markAlive }
  );
}

async function probe(config: GatewayConfig, seconds: number): Promise<void> {
  const nvr = new NvrClient(config.nvrUrl, config.nvrUsername, config.nvrPassword);
  log.info('NVR', await nvr.deviceInfo());

  // 1) Catch-up search over the last two hours, so the stored-read format is checked too.
  const channels = catchUpChannels(config);
  const searchChannels = channels.length > 0 ? channels : [1, 2];
  try {
    const now = new Date();
    const stored = await searchReads(nvr.http, new Date(now.getTime() - 120 * MINUTE), now, searchChannels);
    const byChannel = new Map<string, number>();
    for (const r of stored) byChannel.set(r.channelId, (byChannel.get(r.channelId) ?? 0) + 1);
    log.info(`Catch-up search OK: ${stored.length} stored reads in the last 2 hours on channels ${searchChannels.join(',')}`, Object.fromEntries(byChannel));
    if (stored.length > 0) log.info('Most recent stored read', stored[stored.length - 1]);
  } catch (err) {
    log.error('Catch-up search FAILED', err);
  }

  // 2) Live stream.
  mkdirSync(config.dataDir, { recursive: true });
  const file = join(config.dataDir, `probe-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  log.info(`Recording raw events for ${seconds}s to ${file}`);

  const seenChannels = new Map<string, { name: string | null; reads: number; directions: Set<string> }>();
  let parts = 0;
  const stopAt = Date.now() + seconds * 1000;
  const timer = setTimeout(() => {
    log.info(`Probe finished: ${parts} event parts recorded`);
    for (const [id, c] of seenChannels) {
      log.info(`Channel ${id} (${c.name ?? 'unnamed'}): ${c.reads} plate reads, camera directions: ${[...c.directions].join(', ') || 'none'}`);
    }
    if (seenChannels.size === 0) log.warn('No live plate reads seen. Drive a car past a camera, or probe for longer.');
    process.exit(0);
  }, seconds * 1000);

  while (Date.now() < stopAt) {
    try {
      await nvr.streamOnce((text, part) => {
        parts++;
        appendFileSync(file, `--- ${new Date().toISOString()} ${part.headers['content-type'] ?? ''}\n${text}\n`);
        const read = parseAnprNotification(text);
        if (!read) return;
        const c = seenChannels.get(read.channelId) ?? { name: read.channelName, reads: 0, directions: new Set<string>() };
        c.reads++;
        if (read.cameraDirection) c.directions.add(read.cameraDirection);
        seenChannels.set(read.channelId, c);
        log.info(`Live plate ${read.plate} on channel ${read.channelId} (${read.channelName ?? 'unnamed'}) at ${read.occurredAt} ${read.cameraDirection ?? ''}`);
      }, seconds * 1000);
    } catch (err) {
      log.error('alertStream error', err);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  clearTimeout(timer);
}

async function main(): Promise<void> {
  const [command = 'run', ...args] = process.argv.slice(2);
  if (command !== 'run' && command !== 'probe') {
    console.error('Usage: node src/main.ts run [--dry-run] | probe [seconds]');
    process.exit(2);
  }
  const dryRun = args.includes('--dry-run');
  const config = loadConfig(ROOT, process.env, command === 'run' && !dryRun);
  initLogFile(config.dataDir);

  if (command === 'probe') {
    await probe(config, Number(args[0]) > 0 ? Number(args[0]) : 120);
  } else {
    await run(config, dryRun);
  }
}

main().catch((err) => {
  log.error('Fatal', err);
  process.exit(1);
});
