// Recover plate reads the live stream missed (gateway off, PC asleep, network drop) by searching
// the NVR's stored vehicle detections. Request and response shapes were captured from this
// NVR's own Event Center page (DS-7732NI-M4/24P, V5.04.081, 30 Oct 2026):
//
//   POST /ISAPI/ContentMgmt/eventRecordSearch?format=json
//   {"EventSearchDescription":{"searchID":"<uuid>","searchResultPosition":0,"maxResults":30,
//     "timeSpanList":[{"startTime":"…","endTime":"…"}],"type":"all","channels":[1,2],
//     "eventType":"vehicleMatchResult","ANPRSearch":{"country":"255"}}}
//   → {"EventSearchResult":{"responseStatusStrg":"MORE"|"OK"|"NO MATCHES","numOfMatches":30,
//       "totalMatches":58,"Targets":[{"channel":2,"ANPRMatchResult":{"licensePlate":"…"},
//       "vehicleMatchResult":{"plateNo":"…","vehicleLogo":"…",…},"alarmStartTime":"…+00:00",…}]}}
//
// The captured sample showed no travel direction, but the NVR shows one ("forward"/"reverse") under
// each read in its own UI, so any direction-like field in a result is used when present. Other plain
// fields are kept in raw so gate_events shows what the NVR actually sends.

import { randomUUID } from 'node:crypto';
import { normalizePlate, type AnprRead } from './anprEvent.ts';
import type { DigestClient } from './digest.ts';

export const SEARCH_PATH = '/ISAPI/ContentMgmt/eventRecordSearch?format=json';
const PAGE_SIZE = 30;
const MAX_PAGES = 200;

/** ISAPI wants second precision with an explicit offset; send UTC. */
export function toNvrTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

export function buildSearchBody(opts: {
  from: Date;
  to: Date;
  channels: number[];
  position: number;
  searchId: string;
  maxResults?: number;
}): string {
  return JSON.stringify({
    EventSearchDescription: {
      searchID: opts.searchId,
      searchResultPosition: opts.position,
      maxResults: opts.maxResults ?? PAGE_SIZE,
      timeSpanList: [{ startTime: toNvrTime(opts.from), endTime: toNvrTime(opts.to) }],
      type: 'all',
      channels: opts.channels,
      eventType: 'vehicleMatchResult',
      ANPRSearch: { country: '255' },
    },
  });
}

type SearchPage = { status: string; returned: number; total: number | null; reads: AnprRead[] };

type SearchTarget = {
  channel?: number | string;
  ANPRMatchResult?: { licensePlate?: string };
  vehicleMatchResult?: Record<string, unknown> & { plateNo?: string };
  alarmStartTime?: string;
  startTime?: string;
  eventType?: string;
};

type SearchResult = {
  responseStatusStrg?: string;
  numOfMatches?: number;
  totalMatches?: number;
  Targets?: SearchTarget[];
};

const SKIP_KEY = /url|picture|pic|image|^id$|^channel$|time$/i;

/** Copy short scalar fields from a result (and its nested objects) into raw, skipping links and ids. */
function collectPlainFields(obj: unknown, raw: Record<string, string>, depth = 0): void {
  if (!obj || typeof obj !== 'object' || depth > 2) return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SKIP_KEY.test(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) collectPlainFields(value, raw, depth + 1);
    else if ((typeof value === 'string' || typeof value === 'number') && String(value).length <= 64 && !(key in raw)) {
      if (String(value) !== '') raw[key] = String(value);
    }
  }
}

/** A "forward"/"reverse" value under any direction-like key, at any depth. */
export function findDirection(obj: unknown, depth = 0): 'forward' | 'reverse' | null {
  if (!obj || typeof obj !== 'object' || depth > 3) return null;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof value === 'string' && /direction/i.test(key)) {
      const v = value.trim().toLowerCase();
      if (v === 'forward' || v === 'reverse') return v;
    } else if (value && typeof value === 'object') {
      const found = findDirection(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export function parseSearchResponse(json: unknown): SearchPage {
  const result: SearchResult = (json as { EventSearchResult?: SearchResult } | null)?.EventSearchResult ?? {};
  const targets = Array.isArray(result.Targets) ? result.Targets : [];
  const reads: AnprRead[] = [];

  for (const t of targets) {
    const plate = String(t?.ANPRMatchResult?.licensePlate ?? t?.vehicleMatchResult?.plateNo ?? '').trim();
    const plateNorm = normalizePlate(plate);
    const at = new Date(t?.alarmStartTime ?? t?.startTime ?? '');
    if (!plateNorm || plateNorm === 'UNKNOWN' || Number.isNaN(at.getTime()) || t?.channel == null) continue;

    const raw: Record<string, string> = { catchUp: 'true', eventType: String(t.eventType ?? 'vehicleMatchResult') };
    collectPlainFields(t, raw);

    reads.push({
      plate,
      plateNorm,
      channelId: String(t.channel),
      channelName: null,
      occurredAt: at.toISOString(),
      cameraDirection: findDirection(t),
      confidence: null,
      eventType: 'vehicleMatchResult',
      raw,
    });
  }

  return {
    status: String(result.responseStatusStrg ?? ''),
    returned: Number(result.numOfMatches ?? targets.length) || 0,
    total: Number.isFinite(Number(result.totalMatches)) ? Number(result.totalMatches) : null,
    reads,
  };
}

/** How many plate reads one channel stored in the window (the set-up page uses it to spot ANPR cameras). */
export async function countStoredReads(http: DigestClient, from: Date, to: Date, channel: number): Promise<number> {
  const res = await http.request(SEARCH_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: buildSearchBody({ from, to, channels: [channel], position: 0, searchId: randomUUID().toUpperCase(), maxResults: 1 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`eventRecordSearch returned HTTP ${res.status}`);
  const page = parseSearchResponse(await res.json());
  return page.total ?? page.returned;
}

/** All stored plate reads on `channels` between `from` and `to`, oldest first. */
export async function searchReads(http: DigestClient, from: Date, to: Date, channels: number[]): Promise<AnprRead[]> {
  const searchId = randomUUID().toUpperCase();
  const reads: AnprRead[] = [];
  let position = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await http.request(SEARCH_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: buildSearchBody({ from, to, channels, position, searchId }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`eventRecordSearch returned HTTP ${res.status}`);
    const parsed = parseSearchResponse(await res.json());
    reads.push(...parsed.reads);
    position += parsed.returned;
    if (parsed.status !== 'MORE' || parsed.returned === 0) break;
  }

  return reads.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
