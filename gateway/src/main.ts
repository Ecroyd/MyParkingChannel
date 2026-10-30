// My Parking Channel ANPR gateway.
//
//   mpc-gateway.exe                    open the set-up / status page and run the gateway
//   … run [--data DIR] [--port N] [--no-browser] [--service] [--dry-run]
//   … probe [secs]                     headless test against an NVR from .env; sends nothing
//
// In development: `node src/main.ts …` with the same arguments.

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnprNotification } from './anprEvent.ts';
import { searchReads } from './catchUp.ts';
import { loadConfig, type GatewayConfig } from './config.ts';
import { Engine } from './engine.ts';
import { initLogFile, log } from './log.ts';
import { NvrClient } from './nvr.ts';
import { GatewayApp, UI_PORT } from './ui/server.ts';
import { buildInstallScript, defaultWindowsDataDir, launchElevatedInstall } from './windowsInstall.ts';

/** True for the single-file mpc-gateway.exe; false when run as `node src/main.ts`. */
const PACKAGED = !/^node(\.exe)?$/i.test(basename(process.execPath));
const ROOT = PACKAGED ? dirname(process.execPath) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function openBrowser(url: string): void {
  const [cmd, ...args] = IS_WINDOWS ? ['cmd', '/c', 'start', '""', url] : process.platform === 'darwin' ? ['open', url] : ['xdg-open', url];
  spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).on('error', () => {}).unref();
}

/** The default: set-up page + gateway. Falls back to a .env set-up when one exists. */
async function runApp(args: string[]): Promise<void> {
  const service = args.includes('--service');
  const dryRun = args.includes('--dry-run');
  const noBrowser = service || args.includes('--no-browser');
  const port = Number(option(args, '--port')) || UI_PORT;
  const dataDir = resolve(option(args, '--data') ?? (IS_WINDOWS ? defaultWindowsDataDir() : join(ROOT, 'data')));
  mkdirSync(dataDir, { recursive: true });
  initLogFile(dataDir);

  // Headless .env set-up (developers, or sites configured by hand): no pairing, no set-up page.
  if (!PACKAGED && existsSync(join(ROOT, '.env')) && !option(args, '--data')) {
    const engine = new Engine(loadConfig(ROOT, process.env, !dryRun), { dryRun });
    engine.start();
    const stop = async () => {
      await engine.stop();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    return;
  }

  const url = `http://127.0.0.1:${port}`;
  let app: GatewayApp;
  const shutdown = async () => {
    await app.stopEngine();
    await app.close();
    process.exit(0);
  };

  app = new GatewayApp({
    dataDir,
    port,
    service,
    dryRun,
    canInstall: IS_WINDOWS && !service,
    install: async () => {
      const launch = PACKAGED ? [process.execPath] : [process.execPath, fileURLToPath(import.meta.url)];
      await launchElevatedInstall(
        buildInstallScript({
          installDir: defaultWindowsDataDir(),
          dataDir,
          launch,
          packagedExe: PACKAGED ? process.execPath : null,
          waitForPid: process.pid,
          port,
        })
      );
      log.info('Handing over to the background service');
      setTimeout(() => void shutdown(), 500);
    },
  });

  if (!(await app.listen())) {
    // Another copy (usually the background service) already owns the page.
    log.info(`The gateway is already running; opening ${url}`);
    if (!noBrowser) openBrowser(url);
    setTimeout(() => process.exit(0), 1000);
    return;
  }

  await app.applySettings();
  if (!noBrowser) openBrowser(url);
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

async function probe(config: GatewayConfig, seconds: number): Promise<void> {
  const MINUTE = 60_000;
  const nvr = new NvrClient(config.nvrUrl, config.nvrUsername, config.nvrPassword);
  log.info('NVR', await nvr.deviceInfo());
  log.info('Cameras', await nvr.channels().catch((e: Error) => `could not list: ${e.message}`));

  // 1) Catch-up search over the last two hours, so the stored-read format is checked too.
  const configured = [...config.channelDirections.keys()].map(Number).filter((n) => n > 0);
  const searchChannels = configured.length > 0 ? configured : [1, 2];
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
  // Drop the program path(s): node + script in development; when packaged the exe is repeated in
  // argv[1], as typed (relative or absolute), so compare by file name.
  const self = basename(process.execPath).toLowerCase();
  const argv = process.argv.slice(1);
  while (argv.length && (basename(argv[0]).toLowerCase() === self || /main\.(ts|js|cjs)$/.test(argv[0]))) argv.shift();
  const [command = 'run', ...rest] = argv[0]?.startsWith('--') ? ['run', ...argv] : argv;

  if (command === 'probe') {
    const config = loadConfig(ROOT, process.env, false);
    initLogFile(config.dataDir);
    await probe(config, Number(rest[0]) > 0 ? Number(rest[0]) : 120);
  } else if (command === 'run') {
    await runApp(rest);
  } else {
    console.error('Usage: mpc-gateway [run] [--data DIR] [--port N] [--no-browser] [--service] [--dry-run] | probe [seconds]');
    process.exit(2);
  }
}

main().catch((err) => {
  log.error('Fatal', err);
  process.exit(1);
});
