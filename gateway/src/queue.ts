// Durable outbox (SQLite, built into Node 24). Every accepted read is written here before any
// network call, so an internet outage or a restart delays reads instead of losing them.

import { DatabaseSync } from 'node:sqlite';

export type CapturePayload = {
  plate: string;
  occurred_at: string;
  direction: 'in' | 'out';
  camera_id: string;
  lane: string | null;
  confidence: number | null;
  source: string;
  device_id?: string;
  raw: Record<string, string>;
};

export type QueuedRead = { id: number; payload: CapturePayload; attempts: number };

const MAX_BACKOFF_MS = 5 * 60 * 1000;

export class ReadQueue {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        last_error TEXT
      );
      CREATE TABLE IF NOT EXISTS dead (
        id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        failed_at INTEGER NOT NULL,
        error TEXT
      );
      -- Every plate read seen (live or catch-up), sent or not: the dedupe memory.
      CREATE TABLE IF NOT EXISTS seen (
        plate_norm TEXT NOT NULL,
        channel TEXT NOT NULL,
        at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS seen_lookup ON seen (plate_norm, channel, at_ms);
      CREATE TABLE IF NOT EXISTS state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /**
   * Record a read and say whether it is new: false when the same plate was already seen on the
   * same channel within windowMs either side. Every read is recorded, so a car sitting at the
   * barrier keeps its window open, and catch-up can overlap live reads without double counting.
   */
  recordRead(plateNorm: string, channel: string, atMs: number, windowMs: number): boolean {
    const nearby = this.db
      .prepare('SELECT 1 AS x FROM seen WHERE plate_norm = ? AND channel = ? AND at_ms BETWEEN ? AND ? LIMIT 1')
      .get(plateNorm, channel, atMs - windowMs, atMs + windowMs);
    this.db.prepare('INSERT INTO seen (plate_norm, channel, at_ms) VALUES (?, ?, ?)').run(plateNorm, channel, atMs);
    return !nearby;
  }

  /** Forget reads older than the given age (catch-up never looks back further). */
  pruneSeen(olderThanMs: number, nowMs = Date.now()): void {
    this.db.prepare('DELETE FROM seen WHERE at_ms < ?').run(nowMs - olderThanMs);
  }

  getState(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM state WHERE key = ?').get(key);
    return row ? String(row.value) : null;
  }

  setState(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  enqueue(payload: CapturePayload, nowMs = Date.now()): void {
    this.db
      .prepare('INSERT INTO outbox (payload, created_at, next_attempt_at) VALUES (?, ?, ?)')
      .run(JSON.stringify(payload), nowMs, nowMs);
  }

  /** Oldest reads that are due, in arrival order. */
  due(limit: number, nowMs = Date.now()): QueuedRead[] {
    return this.db
      .prepare('SELECT id, payload, attempts FROM outbox WHERE next_attempt_at <= ? ORDER BY id LIMIT ?')
      .all(nowMs, limit)
      .map((row) => ({
        id: Number(row.id),
        payload: JSON.parse(String(row.payload)) as CapturePayload,
        attempts: Number(row.attempts),
      }));
  }

  done(id: number): void {
    this.db.prepare('DELETE FROM outbox WHERE id = ?').run(id);
  }

  /** Retry later with exponential backoff (5s, 10s, 20s … capped at 5 minutes). */
  retry(id: number, attempts: number, error: string, nowMs = Date.now()): void {
    const delay = Math.min(MAX_BACKOFF_MS, 5000 * 2 ** Math.min(attempts, 10));
    this.db
      .prepare('UPDATE outbox SET attempts = ?, next_attempt_at = ?, last_error = ? WHERE id = ?')
      .run(attempts + 1, nowMs + delay, error.slice(0, 500), id);
  }

  /** The server rejected the read itself (400): park it so it never blocks the queue. */
  bury(id: number, error: string, nowMs = Date.now()): void {
    this.db
      .prepare(
        'INSERT INTO dead (id, payload, created_at, failed_at, error) SELECT id, payload, created_at, ?, ? FROM outbox WHERE id = ?'
      )
      .run(nowMs, error.slice(0, 500), id);
    this.done(id);
  }

  pendingCount(): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM outbox').get()?.n ?? 0);
  }

  close(): void {
    this.db.close();
  }
}
