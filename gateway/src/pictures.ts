// Plate-read pictures (gateway 0.3.0+). Stored reads carry links to their pictures on the
// recorder; after a read is accepted by My Parking Channel the gateway downloads them (same
// recorder login) and uploads them to POST /api/internal/anpr/picture. Only when the site has
// pictures switched on (heartbeat reply); best effort, never holds up sending reads.

import type { DigestClient } from './digest.ts';
import type { CloudSender } from './sender.ts';
import type { QueuedRead } from './queue.ts';
import { log } from './log.ts';

const MAX_BYTES = 2 * 1024 * 1024;

/** The recorder reports links with its own idea of its address; always fetch from the one we use. */
export function recorderPath(link: string): string | null {
  const trimmed = link.trim();
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

export function imageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  return null;
}

export class PictureUploader {
  private enabled = false;
  private lastError: string | null = null;
  private uploaded = 0;

  private readonly http: DigestClient;
  private readonly sender: CloudSender;

  constructor(http: DigestClient, sender: CloudSender) {
    this.http = http;
    this.sender = sender;
  }

  setEnabled(on: boolean): void {
    if (on !== this.enabled) log.info(on ? 'Picture upload switched on for this site' : 'Picture upload is off for this site');
    this.enabled = on;
  }

  status(): { enabled: boolean; uploaded: number; lastError: string | null } {
    return { enabled: this.enabled, uploaded: this.uploaded, lastError: this.lastError };
  }

  private async download(link: string): Promise<{ bytes: Uint8Array; type: string } | string> {
    const path = recorderPath(link);
    if (!path) return `unusable link ${link.slice(0, 80)}`;
    const res = await this.http.request(path, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      await res.body?.cancel();
      return `recorder returned HTTP ${res.status}`;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES) return `picture too large (${bytes.length} bytes)`;
    const type = imageType(bytes);
    if (!type) return 'recorder did not return a JPEG or PNG';
    return { bytes, type };
  }

  /** drain() hook: upload the pictures of a read that was just accepted. */
  async afterSent(item: QueuedRead, outcome: { duplicate: boolean; eventId?: string | null }): Promise<void> {
    const pictures = item.payload.pictures;
    if (!this.enabled || outcome.duplicate || !outcome.eventId || !pictures) return;
    for (const kind of ['plate', 'scene'] as const) {
      const link = pictures[kind];
      if (!link || !this.enabled) continue;
      const got = await this.download(link);
      if (typeof got === 'string') {
        this.lastError = `${kind} picture: ${got}`;
        log.warn(`Picture download failed for ${item.payload.plate}`, this.lastError);
        continue;
      }
      const result = await this.sender.uploadPicture(outcome.eventId, kind, got.bytes, got.type);
      if (result === 'ok') {
        this.uploaded++;
        this.lastError = null;
      } else if (result === 'off') {
        this.setEnabled(false);
      } else {
        this.lastError = `${kind} upload: ${result}`;
        log.warn(`Picture upload failed for ${item.payload.plate}`, result);
      }
    }
  }
}
