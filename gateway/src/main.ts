// My Parking Channel ANPR gateway.
//
//   mpc-gateway.exe                    open the set-up / status page and run the gateway
//   … run [--data DIR] [--port N] [--no-browser] [--service] [--dry-run]
//   … probe [secs]                     headless test against an NVR from .env; sends nothing
//
// In development: `node src/main.ts …` with the same arguments.

import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnprNotification } from './anprEvent.ts';
import { searchReads } from './catchUp.ts';
import { loadConfig, type GatewayConfig } from './config.ts';
import { Engine } from './engine.ts';
import { initLogFile, log } from './log.ts';
import { NvrClient } from './nvr.ts';
import { GatewayApp, UI_PORT } from './ui/server.ts';
import { loadSettings } from './settings.ts';
import { cleanUpOldExe, Updater } from './updater.ts';
import { compareVersions, GATEWAY_VERSION } from './version.ts';
import {
  buildInstallScript,
  buildTaskRefreshScript,
  defaultWindowsDataDir,
  launchElevatedInstall,
  runPowerShell,
  TASK_NAME,
} from './windowsInstall.ts';

/** True for the single-file mpc-gateway.exe; false when run as `node src/main.ts`. */
const PACKAGED = !/^node(\.exe)?$/i.test(basename(process.execPath));
const ROOT = PACKAGED ? dirname(process.execPath) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';

function option(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const HOUR = 3_600_000;
/** Marks a startup task already given the repeat trigger (see buildTaskRefreshScript). */
const TASK_REFRESHED_FILE = 'task-refreshed-v2';

/** Start a URL after this process has gone (the page needs the background gateway to be back). */
function openBrowserLater(url: string, seconds: number): void {
  if (!IS_WINDOWS) return openBrowser(url);
  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Sleep -Seconds ${seconds}; Start-Process '${url}'`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

/** Version of the gateway already serving the page; null for builds before 0.2.0 (no version). */
async function runningVersion(url: string): Promise<string | null> {
  try {
    const res = await fetch(`${url}/api/state`, { headers: { 'x-mpc-gateway': '1' }, signal: AbortSignal.timeout(5000) });
    const state = (await res.json()) as { version?: unknown };
    return typeof state.version === 'string' ? state.version : null;
  } catch {
    return null;
  }
}

/**
 * The background (Windows service) copy keeps itself current: removes the exe an update left
 * behind, gives an older startup task its repeat trigger, and checks for releases every 6 hours.
 */
function startServiceMaintenance(dataDir: string, onUpdated: () => Promise<void>): Updater | null {
  if (!PACKAGED || !IS_WINDOWS) return null;
  try {
    cleanUpOldExe(process.execPath);
  } catch (err) {
    log.warn('Could not remove the previous version', err);
  }

  const marker = join(dataDir, TASK_REFRESHED_FILE);
  if (!existsSync(marker)) {
    runPowerShell(buildTaskRefreshScript())
      .then(() => {
        writeFileSync(marker, new Date().toISOString());
        log.info('Startup task updated: it now also starts at sign-in and every 5 minutes if stopped');
      })
      .catch((err) => log.warn('Could not update the startup task', err));
  }

  if (loadSettings(dataDir)?.autoUpdate === false) {
    log.info('Auto-update is turned off in settings.json');
    return null;
  }
  const updater = new Updater(process.execPath);
  const check = async () => {
    if (await updater.checkAndInstall()) await onUpdated();
  };
  setTimeout(() => void check(), 2 * 60_000);
  setInterval(() => void check(), 6 * HOUR);
  return updater;
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
  let updater: Updater | null = null;
  const shutdown = async () => {
    await app.stopEngine();
    await app.close();
    process.exit(0);
  };
  const installElevated = () => {
    const launch = PACKAGED ? [process.execPath] : [process.execPath, fileURLToPath(import.meta.url)];
    return launchElevatedInstall(
      buildInstallScript({
        installDir: defaultWindowsDataDir(),
        dataDir,
        launch,
        packagedExe: PACKAGED ? process.execPath : null,
        waitForPid: process.pid,
        port,
      })
    );
  };

  app = new GatewayApp({
    dataDir,
    port,
    service,
    dryRun,
    canInstall: IS_WINDOWS && !service,
    install: async () => {
      await installElevated();
      log.info('Handing over to the background service');
      setTimeout(() => void shutdown(), 500);
    },
    updateStatus: () => updater?.status ?? { lastCheckAt: null, latestVersion: null, lastError: null },
  });

  if (!(await app.listen())) {
    // Another copy (usually the background service) already owns the page. If it is an older
    // version, this download is an upgrade: install it over the background copy (one UAC prompt).
    const running = await runningVersion(url);
    if (PACKAGED && IS_WINDOWS && !service && (running === null || compareVersions(GATEWAY_VERSION, running) > 0)) {
      log.info(`Upgrading the background gateway from ${running ?? 'an older version'} to ${GATEWAY_VERSION}`);
      try {
        await installElevated();
        if (!noBrowser) openBrowserLater(url, 15);
      } catch (err) {
        log.warn('Upgrade not installed', err);
        if (!noBrowser) openBrowser(url);
      }
    } else {
      log.info(`The gateway is already running; opening ${url}`);
      if (!noBrowser) openBrowser(url);
    }
    setTimeout(() => process.exit(0), 1000);
    return;
  }

  if (service) {
    updater = startServiceMaintenance(dataDir, async () => {
      // Ask for the new exe straight away; the task's 5-minute repeat is the fallback.
      spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Sleep -Seconds 5; Start-ScheduledTask -TaskName '${TASK_NAME}'`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      await shutdown();
    });
  }

  log.info(`Gateway ${GATEWAY_VERSION}${service ? ' (background)' : ''}`);
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
