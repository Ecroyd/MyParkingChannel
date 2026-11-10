// Phase 2: keep the ANPR cameras' allow-lists in step with My Parking Channel, so the barrier
// opens for expected cars by itself (the camera decides; nothing waits on this PC or the internet).
//
// Every few minutes: fetch the whole desired list (GET /api/internal/anpr/allowlist), compare it
// with what this gateway has put on each camera (remembered in allowlist.db), add or re-date
// what changed and remove what is no longer wanted. Only plates this gateway added are ever
// removed: entries staff typed into the camera themselves are left alone. Every few hours the
// camera's own list is read back and anything missing is re-added.
//
// ⚠ The add and delete request formats below are Hikvision's documented 7-series calls as best
// known, NOT yet verified on the Fly Parks cameras (iDS-2CD7A26G0/P-IZHSY, V5.8.50). The search
// call is from Hikvision's ISAPI LPR integration guide. Run "Test camera" on the gateway page
// (testCamera) before turning syncing on: it adds, finds and deletes one test plate and shows
// each raw response. If a call is wrong, capture the real one from the camera's own web page
// (Road Traffic → Allowlist, browser dev tools) and fix it here.

import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { DigestClient } from './digest.ts';
import { log } from './log.ts';

export type AllowEntry = { plate: string; validFrom: string; validUntil: string };

/** What the camera holds: dates only (no times), in the site's time zone. */
export type CameraEntry = { plate: string; from: string; until: string };

export type CameraConfig = { name: string; url: string; username: string; password: string };

export const SITE_TIME_ZONE = 'Europe/London';
const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: SITE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "2026-11-10T23:30:00Z" → "2026-11-10" (London). */
export function cameraDate(iso: string): string {
  return DAY_FORMAT.format(new Date(iso));
}

export function toCameraEntry(e: AllowEntry): CameraEntry {
  return { plate: e.plate, from: cameraDate(e.validFrom), until: cameraDate(e.validUntil) };
}

export type AllowListPlan = { upsert: CameraEntry[]; remove: string[] };

/**
 * What to change on one camera: plates that are new or whose dates changed, and plates this
 * gateway added earlier that are no longer wanted.
 */
export function planChanges(desired: AllowEntry[], pushed: Map<string, CameraEntry>): AllowListPlan {
  const want = new Map(desired.map((e) => [e.plate, toCameraEntry(e)]));
  const upsert: CameraEntry[] = [];
  for (const entry of want.values()) {
    const had = pushed.get(entry.plate);
    if (!had || had.from !== entry.from || had.until !== entry.until) upsert.push(entry);
  }
  const remove = [...pushed.keys()].filter((plate) => !want.has(plate));
  return { upsert, remove };
}

/**
 * Refuse a sync that would remove most of what we put on a camera in one go: far more likely a
 * bad desired list (an outage, a bug) than half the bookings vanishing at once.
 */
export function looksLikeMassRemoval(plan: AllowListPlan, pushedCount: number): boolean {
  return plan.remove.length > 20 && plan.remove.length > pushedCount / 2;
}

// --- Camera calls ----------------------------------------------------------------------------

const xmlTag = (block: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`, 'i').exec(block)?.[1]?.trim() ?? null;

export type ListedPlate = { id: string; plate: string; type: string | null };

/** <LPListAuditSearchResult> → plates with their record ids. */
export function parseListSearch(xml: string): { status: string; returned: number; plates: ListedPlate[] } {
  const plates: ListedPlate[] = [];
  for (const block of xml.match(/<LicensePlateInfo>[\s\S]*?<\/LicensePlateInfo>/gi) ?? []) {
    const id = xmlTag(block, 'id');
    const plate = xmlTag(block, 'LicensePlate');
    if (id && plate) plates.push({ id, plate: plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), type: xmlTag(block, 'type') });
  }
  return {
    status: xmlTag(xml, 'responseStatusStrg') ?? '',
    returned: Number(xmlTag(xml, 'numOfMatches') ?? plates.length) || 0,
    plates,
  };
}

export class CameraAllowList {
  readonly http: DigestClient;
  private readonly channel: number;

  constructor(camera: CameraConfig, fetchImpl: typeof fetch = fetch, channel = 1) {
    this.http = new DigestClient(camera.url.replace(/\/+$/, ''), camera.username, camera.password, fetchImpl);
    this.channel = channel;
  }

  private async send(method: string, path: string, body: string, type: string): Promise<{ status: number; text: string }> {
    const res = await this.http.request(path, {
      method,
      headers: { 'content-type': type },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    return { status: res.status, text: await res.text() };
  }

  private static check(what: string, r: { status: number; text: string }): void {
    if (r.status === 401) throw new Error('The camera rejected the username or password');
    if (r.status < 200 || r.status >= 300) throw new Error(`${what} returned HTTP ${r.status}: ${r.text.slice(0, 300)}`);
    // ISAPI reports failures inside a 200 too: statusCode 1 is OK (XML <statusCode> or JSON).
    if (/<statusCode>\s*[^1\s]|"statusCode"\s*:\s*[^1\s]/.test(r.text)) throw new Error(`${what} failed: ${r.text.slice(0, 300)}`);
  }

  /** Every plate in the camera's lists (allow and block), with its record id. */
  async list(): Promise<ListedPlate[]> {
    const searchId = randomUUID().toUpperCase();
    const out: ListedPlate[] = [];
    for (let position = 0, page = 0; page < 200; page++) {
      const body =
        '<?xml version="1.0" encoding="UTF-8"?><LPListAuditSearchDescription version="2.0" xmlns="http://www.std-cgi.org/ver20/XMLSchema">' +
        `<searchID>${searchId}</searchID><searchResultPosition>${position}</searchResultPosition><maxResults>100</maxResults>` +
        '</LPListAuditSearchDescription>';
      const r = await this.send('POST', `/ISAPI/Traffic/channels/${this.channel}/searchLPListAudit`, body, 'application/xml');
      CameraAllowList.check('List search', r);
      const parsed = parseListSearch(r.text);
      out.push(...parsed.plates);
      position += parsed.returned;
      if (parsed.status.toUpperCase() !== 'MORE' || parsed.returned === 0) break;
    }
    return out;
  }

  /** Add or re-date plates on the allow-list. Unverified format: see the note at the top. */
  async upsert(entries: CameraEntry[]): Promise<{ status: number; text: string }> {
    const body = JSON.stringify({
      LicensePlateInfoList: entries.map((e) => ({
        LicensePlate: e.plate,
        listType: 'whiteList',
        createTime: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
        effectiveStartDate: e.from,
        effectiveTime: e.until,
        id: '',
      })),
    });
    const r = await this.send('PUT', `/ISAPI/Traffic/channels/${this.channel}/licensePlateAuditData/record?format=json`, body, 'application/json');
    CameraAllowList.check('Allow-list add', r);
    return r;
  }

  /** Delete records by id (ids from list()). Unverified format: see the note at the top. */
  async remove(ids: string[]): Promise<{ status: number; text: string }> {
    const r = await this.send('PUT', `/ISAPI/Traffic/channels/${this.channel}/DelLicensePlateAuditData?format=json`, JSON.stringify({ id: ids }), 'application/json');
    CameraAllowList.check('Allow-list delete', r);
    return r;
  }
}

// --- What this gateway has put on each camera ------------------------------------------------

export class AllowListStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS pushed (
        camera TEXT NOT NULL,
        plate TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_until TEXT NOT NULL,
        PRIMARY KEY (camera, plate)
      );
    `);
  }

  pushed(camera: string): Map<string, CameraEntry> {
    const rows = this.db.prepare('SELECT plate, valid_from, valid_until FROM pushed WHERE camera = ?').all(camera);
    return new Map(rows.map((r) => [String(r.plate), { plate: String(r.plate), from: String(r.valid_from), until: String(r.valid_until) }]));
  }

  saved(camera: string, entries: CameraEntry[]): void {
    const stmt = this.db.prepare(
      'INSERT INTO pushed (camera, plate, valid_from, valid_until) VALUES (?, ?, ?, ?) ON CONFLICT (camera, plate) DO UPDATE SET valid_from = excluded.valid_from, valid_until = excluded.valid_until'
    );
    for (const e of entries) stmt.run(camera, e.plate, e.from, e.until);
  }

  removed(camera: string, plates: string[]): void {
    const stmt = this.db.prepare('DELETE FROM pushed WHERE camera = ? AND plate = ?');
    for (const p of plates) stmt.run(camera, p);
  }

  close(): void {
    this.db.close();
  }
}

// --- The sync loop ---------------------------------------------------------------------------

export type CameraSyncStatus = {
  name: string;
  /** Plates this gateway holds on the camera. */
  plates: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

export type AllowListStatus = {
  enabled: boolean;
  desired: number | null;
  lastFetchAt: string | null;
  lastFetchError: string | null;
  cameras: CameraSyncStatus[];
};

const BATCH = 50;
const VERIFY_EVERY_MS = 6 * 3_600_000;

export class AllowListSync {
  private readonly cameras: { config: CameraConfig; client: CameraAllowList; status: CameraSyncStatus; verifiedAt: number }[];
  private readonly store: AllowListStore;
  private readonly fetchDesired: () => Promise<AllowEntry[]>;
  private readonly state: AllowListStatus;
  private busy = false;

  constructor(opts: {
    cameras: CameraConfig[];
    storePath: string;
    fetchDesired: () => Promise<AllowEntry[]>;
    fetchImpl?: typeof fetch;
  }) {
    this.store = new AllowListStore(opts.storePath);
    this.fetchDesired = opts.fetchDesired;
    this.cameras = opts.cameras.map((config) => ({
      config,
      client: new CameraAllowList(config, opts.fetchImpl),
      status: { name: config.name, plates: this.store.pushed(config.name).size, lastSyncAt: null, lastError: null },
      verifiedAt: 0,
    }));
    this.state = { enabled: true, desired: null, lastFetchAt: null, lastFetchError: null, cameras: this.cameras.map((c) => c.status) };
  }

  status(): AllowListStatus {
    return { ...this.state, cameras: this.cameras.map((c) => ({ ...c.status })) };
  }

  close(): void {
    this.store.close();
  }

  /** One pass over every camera. Never throws. */
  async run(now = Date.now()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      let desired: AllowEntry[];
      try {
        desired = await this.fetchDesired();
        Object.assign(this.state, { desired: desired.length, lastFetchAt: new Date(now).toISOString(), lastFetchError: null });
      } catch (err) {
        // Without the list nothing is changed on the cameras: what they hold keeps working.
        this.state.lastFetchError = err instanceof Error ? err.message : String(err);
        log.warn('Allow-list: could not fetch the list from My Parking Channel; cameras left as they are', this.state.lastFetchError);
        return;
      }
      for (const cam of this.cameras) await this.syncCamera(cam, desired, now);
    } finally {
      this.busy = false;
    }
  }

  private async syncCamera(cam: AllowListSync['cameras'][number], desired: AllowEntry[], now: number): Promise<void> {
    const name = cam.config.name;
    try {
      // Every few hours read the camera back: re-add what went missing (reset, manual delete).
      let listed: ListedPlate[] | null = null;
      if (now - cam.verifiedAt > VERIFY_EVERY_MS) {
        listed = await cam.client.list();
        const onCamera = new Set(listed.map((p) => p.plate));
        const lost = [...this.store.pushed(name).keys()].filter((p) => !onCamera.has(p));
        if (lost.length) {
          log.warn(`Allow-list ${name}: ${lost.length} plates are no longer on the camera; re-adding`);
          this.store.removed(name, lost);
        }
        cam.verifiedAt = now;
      }

      const pushed = this.store.pushed(name);
      const plan = planChanges(desired, pushed);
      if (looksLikeMassRemoval(plan, pushed.size)) {
        throw new Error(`Refusing to remove ${plan.remove.length} of ${pushed.size} plates at once; check the bookings, then restart the gateway to retry`);
      }

      for (let i = 0; i < plan.upsert.length; i += BATCH) {
        const batch = plan.upsert.slice(i, i + BATCH);
        await cam.client.upsert(batch);
        this.store.saved(name, batch);
      }

      if (plan.remove.length) {
        listed ??= await cam.client.list();
        const ids = new Map(listed.map((p) => [p.plate, p.id]));
        const gone = plan.remove.filter((p) => !ids.has(p));
        this.store.removed(name, gone);
        const toDelete = plan.remove.filter((p) => ids.has(p));
        for (let i = 0; i < toDelete.length; i += BATCH) {
          const batch = toDelete.slice(i, i + BATCH);
          await cam.client.remove(batch.map((p) => ids.get(p)!));
          this.store.removed(name, batch);
        }
      }

      if (plan.upsert.length || plan.remove.length) {
        log.info(`Allow-list ${name}: ${plan.upsert.length} added or re-dated, ${plan.remove.length} removed`);
      }
      Object.assign(cam.status, { plates: this.store.pushed(name).size, lastSyncAt: new Date(now).toISOString(), lastError: null });
    } catch (err) {
      cam.status.lastError = err instanceof Error ? err.message : String(err);
      cam.status.plates = this.store.pushed(name).size;
      log.warn(`Allow-list ${name}: sync failed; will retry`, cam.status.lastError);
    }
  }
}

// --- On-site check before turning it on ------------------------------------------------------

export const TEST_PLATE = 'MPCTEST1';

export type TestStep = { step: string; ok: boolean; detail: string };

/**
 * Add TEST_PLATE for today, find it in the camera's list as an allow-list entry, delete it, and
 * confirm it is gone. Each step's outcome (and raw response) is returned for the set-up page.
 */
export async function testCamera(camera: CameraConfig, fetchImpl: typeof fetch = fetch): Promise<TestStep[]> {
  const client = new CameraAllowList(camera, fetchImpl);
  const steps: TestStep[] = [];
  const attempt = async <T>(step: string, fn: () => Promise<T>, describe: (v: T) => string): Promise<T | null> => {
    try {
      const v = await fn();
      steps.push({ step, ok: true, detail: describe(v) });
      return v;
    } catch (err) {
      steps.push({ step, ok: false, detail: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  const before = await attempt('Read the allow-list', () => client.list(), (l) => `${l.length} plates on the camera`);
  if (!before) return steps;
  const today = cameraDate(new Date().toISOString());
  const added = await attempt('Add test plate', () => client.upsert([{ plate: TEST_PLATE, from: today, until: today }]), (r) => `HTTP ${r.status} ${r.text.slice(0, 200)}`);
  if (!added) return steps;
  const found = await attempt(
    'Find test plate',
    async () => {
      const hit = (await client.list()).find((p) => p.plate === TEST_PLATE);
      if (!hit) throw new Error('The camera accepted the request but the test plate is not in its list');
      if (hit.type && !/white|allow/i.test(hit.type)) throw new Error(`The test plate was added as "${hit.type}", not as an allow-list entry`);
      return hit;
    },
    (hit) => `found as ${hit.type ?? 'unknown type'} (id ${hit.id})`
  );
  if (!found) return steps;
  await attempt('Delete test plate', () => client.remove([found.id]), (r) => `HTTP ${r.status} ${r.text.slice(0, 200)}`);
  await attempt(
    'Check it is gone',
    async () => {
      if ((await client.list()).some((p) => p.plate === TEST_PLATE)) throw new Error('The test plate is still on the camera');
      return true;
    },
    () => 'gone'
  );
  return steps;
}
