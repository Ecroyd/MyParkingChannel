// My Parking Channel ANPR gateway.
//
//   node src/main.ts run            stream plate reads from the NVR to My Parking Channel
//   node src/main.ts run --dry-run  same, but only log what would be sent
//   node src/main.ts probe [secs]   record raw NVR events to data/ (default 120s); sends nothing

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnprNotification } from './anprEvent.ts';
import { loadConfig, type GatewayConfig } from './config.ts';
import { ReadDeduper } from './dedupe.ts';
import { initLogFile, log } from './log.ts';
import { NvrClient } from './nvr.ts';
import { resolveDirection, toCapturePayload } from './pipeline.ts';
import { ReadQueue } from './queue.ts';
import { CloudSender } from './sender.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function checkNvr(nvr: NvrClient): Promise<void> {
  try {
    const info = await nvr.deviceInfo();
    log.info('NVR reachable', info);
  } catch (err) {
    log.error('NVR not reachable yet (will keep trying via the stream)', err);
  }
}

async function run(config: GatewayConfig, dryRun: boolean): Promise<void> {
  const nvr = new NvrClient(config.nvrUrl, config.nvrUsername, config.nvrPassword);
  const deduper = new ReadDeduper(config.dedupeSeconds);
  const queue = dryRun ? null : new ReadQueue(join(config.dataDir, 'queue.db'));
  const sender = new CloudSender(config);
  const warnedChannels = new Set<string>();
  let stopping = false;

  log.info(`Gateway starting${dryRun ? ' (dry run: nothing is sent)' : ''}`, {
    nvr: config.nvrUrl,
    cloud: config.mpcBaseUrl,
    channels: Object.fromEntries(config.channelDirections),
    cameraDirections: Object.fromEntries(config.cameraDirections),
    deviceId: config.deviceId,
    pending: queue?.pendingCount() ?? 0,
  });
  if (config.channelDirections.size === 0 && config.cameraDirections.size === 0) {
    log.warn('No CHANNEL_DIRECTIONS or CAMERA_DIRECTIONS set: every read will be skipped. Run probe first.');
  }
  await checkNvr(nvr);

  let draining = false;
  const drain = async () => {
    if (!queue || draining) return;
    draining = true;
    try {
      while ((await sender.drain(queue)) > 0 && !stopping) {
        // keep going while reads are being delivered
      }
    } finally {
      draining = false;
    }
  };

  const onText = (text: string) => {
    const read = parseAnprNotification(text);
    if (!read) return;

    const direction = resolveDirection(read, config);
    if (!direction) {
      if (!warnedChannels.has(read.channelId)) {
        warnedChannels.add(read.channelId);
        log.warn(`Skipping reads from channel ${read.channelId} (${read.channelName ?? 'unnamed'}): no direction configured`);
      }
      return;
    }
    if (!deduper.accept(read.plateNorm, read.channelId, Date.parse(read.occurredAt))) return;

    const payload = toCapturePayload(read, direction, config);
    if (dryRun) {
      log.info('Would send', payload);
      return;
    }
    queue!.enqueue(payload);
    void drain();
  };

  const timers: NodeJS.Timeout[] = [];
  if (!dryRun) {
    timers.push(setInterval(() => void drain(), 5000));
    timers.push(setInterval(() => void sender.heartbeat(), config.heartbeatSeconds * 1000));
    void sender.heartbeat();
  }

  const stop = () => {
    if (stopping) return;
    stopping = true;
    log.info('Stopping');
    timers.forEach(clearInterval);
    queue?.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  await nvr.streamForever(onText, () => stopping);
}

async function probe(config: GatewayConfig, seconds: number): Promise<void> {
  const nvr = new NvrClient(config.nvrUrl, config.nvrUsername, config.nvrPassword);
  const info = await nvr.deviceInfo();
  log.info('NVR', info);

  mkdirSync(config.dataDir, { recursive: true });
  const file = join(config.dataDir, `probe-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  log.info(`Recording raw events for ${seconds}s to ${file}`);

  const channels = new Map<string, { name: string | null; reads: number; directions: Set<string> }>();
  let parts = 0;
  const stopAt = Date.now() + seconds * 1000;
  const timer = setTimeout(() => {
    log.info(`Probe finished: ${parts} event parts recorded`);
    for (const [id, c] of channels) {
      log.info(`Channel ${id} (${c.name ?? 'unnamed'}): ${c.reads} plate reads, camera directions: ${[...c.directions].join(', ') || 'none'}`);
    }
    if (channels.size === 0) log.warn('No plate reads seen. Drive a car past a camera, or probe for longer.');
    process.exit(0);
  }, seconds * 1000);

  while (Date.now() < stopAt) {
    try {
      await nvr.streamOnce((text, part) => {
        parts++;
        appendFileSync(file, `--- ${new Date().toISOString()} ${part.headers['content-type'] ?? ''}\n${text}\n`);
        const read = parseAnprNotification(text);
        if (!read) return;
        const c = channels.get(read.channelId) ?? { name: read.channelName, reads: 0, directions: new Set<string>() };
        c.reads++;
        if (read.cameraDirection) c.directions.add(read.cameraDirection);
        channels.set(read.channelId, c);
        log.info(`Plate ${read.plate} on channel ${read.channelId} (${read.channelName ?? 'unnamed'}) ${read.cameraDirection ?? ''}`);
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
