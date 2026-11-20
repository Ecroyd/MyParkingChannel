// Daily: delete ANPR pictures older than ANPR_PICTURE_RETENTION_DAYS (storage objects and the
// paths on their gate events). Gate events themselves are kept.

import { NextRequest, NextResponse } from 'next/server';
import { isCronRequest } from '@/lib/auth/apiGuards';
import { createAdminClient } from '@/lib/supabase/server';
import { ANPR_PICTURE_BUCKET, ANPR_PICTURE_RETENTION_DAYS } from '@/lib/anpr/pictures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH = 500;
const MAX_BATCHES = 40;

async function handle(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - ANPR_PICTURE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let events = 0;
  let objects = 0;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await supabase
      .from('gate_events')
      .select('id, plate_picture_path, scene_picture_path')
      .lt('event_at', cutoff)
      .or('plate_picture_path.not.is.null,scene_picture_path.not.is.null')
      .limit(BATCH);
    if (error) {
      console.error('[anpr-pictures cron] Query failed:', error);
      return NextResponse.json({ ok: false, error: error.message, events, objects }, { status: 500 });
    }
    const rows = (data ?? []) as { id: string; plate_picture_path: string | null; scene_picture_path: string | null }[];
    if (rows.length === 0) break;

    const paths = rows.flatMap((r) => [r.plate_picture_path, r.scene_picture_path]).filter((p): p is string => Boolean(p));
    const { error: removeError } = await supabase.storage.from(ANPR_PICTURE_BUCKET).remove(paths);
    if (removeError) {
      console.error('[anpr-pictures cron] Remove failed:', removeError);
      return NextResponse.json({ ok: false, error: removeError.message, events, objects }, { status: 500 });
    }
    const { error: clearError } = await supabase
      .from('gate_events')
      .update({ plate_picture_path: null, scene_picture_path: null })
      .in('id', rows.map((r) => r.id));
    if (clearError) {
      console.error('[anpr-pictures cron] Clear failed:', clearError);
      return NextResponse.json({ ok: false, error: clearError.message, events, objects }, { status: 500 });
    }
    events += rows.length;
    objects += paths.length;
    if (rows.length < BATCH) break;
  }

  return NextResponse.json({ ok: true, cutoff, events, objects });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
