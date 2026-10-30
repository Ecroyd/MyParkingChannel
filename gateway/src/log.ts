// Timestamped logging to the console and to <dataDir>/gateway.log (rotated at 5 MB, 3 kept),
// so a headless Windows scheduled task still leaves a readable log.

import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 3;

let logFile: string | null = null;

export function initLogFile(dataDir: string): void {
  mkdirSync(dataDir, { recursive: true });
  logFile = join(dataDir, 'gateway.log');
}

function rotate(file: string): void {
  if (!existsSync(file) || statSync(file).size < MAX_BYTES) return;
  for (let i = KEEP - 1; i >= 1; i--) {
    if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`);
  }
  renameSync(file, `${file}.1`);
}

function write(level: string, message: string, extra?: unknown): void {
  const detail = extra === undefined ? '' : ` ${extra instanceof Error ? extra.message : JSON.stringify(extra)}`;
  const line = `${new Date().toISOString()} ${level} ${message}${detail}`;
  (level === 'ERROR' || level === 'WARN' ? console.error : console.log)(line);
  if (!logFile) return;
  try {
    rotate(logFile);
    appendFileSync(logFile, line + '\n');
  } catch {
    // Logging must never take the gateway down.
  }
}

export const log = {
  info: (message: string, extra?: unknown) => write('INFO', message, extra),
  warn: (message: string, extra?: unknown) => write('WARN', message, extra),
  error: (message: string, extra?: unknown) => write('ERROR', message, extra),
};
