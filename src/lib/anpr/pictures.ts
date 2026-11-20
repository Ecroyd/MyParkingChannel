// src/lib/anpr/pictures.ts
//
// Plate-read pictures sent by the on-site gateway (0.3.0+). Private bucket, one object per gate
// event and kind; staff see them through short-lived signed URLs. Off per site until
// tenant_anpr_config.capture_pictures is set (see migration 20261120_anpr_pictures.sql).

import type { SupabaseClient } from '@supabase/supabase-js';

export const ANPR_PICTURE_BUCKET = 'anpr-pictures';
export const ANPR_PICTURE_MAX_BYTES = 2 * 1024 * 1024;
export const ANPR_PICTURE_RETENTION_DAYS = 90;

export type AnprPictureKind = 'plate' | 'scene';

export function parsePictureKind(value: string | null | undefined): AnprPictureKind | null {
  return value === 'plate' || value === 'scene' ? value : null;
}

export const PICTURE_COLUMN: Record<AnprPictureKind, 'plate_picture_path' | 'scene_picture_path'> = {
  plate: 'plate_picture_path',
  scene: 'scene_picture_path',
};

/** <tenant>/<yyyy-mm-dd of the read>/<event id>-<kind>.<ext> */
export function picturePath(
  tenantId: string,
  eventId: string,
  eventAt: string,
  kind: AnprPictureKind,
  contentType: string
): string {
  const day = new Date(eventAt).toISOString().slice(0, 10);
  const ext = contentType === 'image/png' ? 'png' : 'jpg';
  return `${tenantId}/${day}/${eventId}-${kind}.${ext}`;
}

/** JPEG or PNG, judged by the bytes rather than the header the sender claims. */
export function sniffImageType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  return null;
}

/** Whether this site keeps pictures. False when the column doesn't exist yet. */
export async function picturesEnabled(supabase: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('tenant_anpr_config')
    .select('capture_pictures')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) return false;
  return Boolean((data as { capture_pictures?: boolean } | null)?.capture_pictures);
}

export type PictureFlags = { plate: boolean; scene: boolean };

/**
 * Which of these gate events have pictures. A separate query so lists keep working before the
 * picture columns exist (it just returns nothing then).
 */
export async function fetchPictureFlags(
  supabase: SupabaseClient,
  tenantId: string,
  eventIds: string[]
): Promise<Map<string, PictureFlags>> {
  const flags = new Map<string, PictureFlags>();
  const ids = [...new Set(eventIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('gate_events')
      .select('id, plate_picture_path, scene_picture_path')
      .eq('tenant_id', tenantId)
      .in('id', ids.slice(i, i + 200))
      .or('plate_picture_path.not.is.null,scene_picture_path.not.is.null');
    if (error) return flags;
    for (const r of (data ?? []) as { id: string; plate_picture_path: string | null; scene_picture_path: string | null }[]) {
      flags.set(r.id, { plate: Boolean(r.plate_picture_path), scene: Boolean(r.scene_picture_path) });
    }
  }
  return flags;
}

export type BookingPictureRead = { eventId: string; at: string; plate: boolean; scene: boolean };
export type BookingPictures = { in?: BookingPictureRead; out?: BookingPictureRead };

type PictureEventRow = {
  id: string;
  booking_id: string | null;
  event_at: string;
  direction: string | null;
  plate_picture_path: string | null;
  scene_picture_path: string | null;
};

/** The latest pictured arrival and departure read for each booking (rows newest first). */
export function latestPicturesByBooking(rows: PictureEventRow[]): Record<string, BookingPictures> {
  const out: Record<string, BookingPictures> = {};
  for (const r of rows) {
    if (!r.booking_id || (r.direction !== 'in' && r.direction !== 'out')) continue;
    if (!r.plate_picture_path && !r.scene_picture_path) continue;
    const entry = (out[r.booking_id] ??= {});
    if (entry[r.direction]) continue;
    entry[r.direction] = {
      eventId: r.id,
      at: r.event_at,
      plate: Boolean(r.plate_picture_path),
      scene: Boolean(r.scene_picture_path),
    };
  }
  return out;
}

/** Pictured camera reads for these bookings. Empty before the picture columns exist. */
export async function fetchBookingPictures(
  supabase: SupabaseClient,
  tenantId: string,
  bookingIds: string[]
): Promise<Record<string, BookingPictures>> {
  const ids = [...new Set(bookingIds.filter(Boolean))];
  const rows: PictureEventRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from('gate_events')
      .select('id, booking_id, event_at, direction, plate_picture_path, scene_picture_path')
      .eq('tenant_id', tenantId)
      .in('booking_id', ids.slice(i, i + 200))
      .or('plate_picture_path.not.is.null,scene_picture_path.not.is.null')
      .order('event_at', { ascending: false })
      .limit(1000);
    if (error) return {};
    rows.push(...((data ?? []) as PictureEventRow[]));
  }
  rows.sort((a, b) => b.event_at.localeCompare(a.event_at));
  return latestPicturesByBooking(rows);
}
