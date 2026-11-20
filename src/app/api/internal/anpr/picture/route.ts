// POST /api/internal/anpr/picture?tenantId=&eventId=&kind=plate|scene
// The on-site gateway uploads a plate read's picture (raw JPEG/PNG body, at most 2 MB) after the
// read was accepted by /capture. Same gateway auth as /capture. Refused with 409 when the site
// doesn't keep pictures, so a gateway that hasn't heard yet stops sending.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { authenticateGatewayRequest } from '@/lib/anpr/gatewayDevice';
import {
  ANPR_PICTURE_BUCKET,
  ANPR_PICTURE_MAX_BYTES,
  PICTURE_COLUMN,
  parsePictureKind,
  picturePath,
  picturesEnabled,
  sniffImageType,
} from '@/lib/anpr/pictures';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const tenantId = params.get('tenantId');
    const eventId = params.get('eventId');
    const kind = parsePictureKind(params.get('kind'));
    if (!tenantId || !eventId || !UUID_RE.test(eventId) || !kind) {
      return NextResponse.json({ error: 'tenantId, eventId and kind (plate|scene) are required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const auth = await authenticateGatewayRequest(req, supabase, tenantId);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!(await picturesEnabled(supabase, tenantId))) {
      return NextResponse.json({ error: 'Pictures are not kept for this site' }, { status: 409 });
    }

    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > ANPR_PICTURE_MAX_BYTES) {
      return NextResponse.json({ error: 'Picture too large' }, { status: 413 });
    }
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0 || bytes.length > ANPR_PICTURE_MAX_BYTES) {
      return NextResponse.json({ error: bytes.length ? 'Picture too large' : 'Empty body' }, { status: bytes.length ? 413 : 400 });
    }
    const contentType = sniffImageType(bytes);
    if (!contentType) return NextResponse.json({ error: 'Body must be a JPEG or PNG' }, { status: 400 });

    const { data: event, error: eventError } = await supabase
      .from('gate_events')
      .select('id, event_at')
      .eq('id', eventId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (eventError) {
      console.error('[ANPR Picture] Event lookup failed:', eventError);
      return NextResponse.json({ error: 'Event lookup failed' }, { status: 500 });
    }
    if (!event) return NextResponse.json({ error: 'Unknown gate event' }, { status: 400 });

    const path = picturePath(tenantId, event.id, event.event_at, kind, contentType);
    const { error: uploadError } = await supabase.storage
      .from(ANPR_PICTURE_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) {
      console.error('[ANPR Picture] Upload failed:', uploadError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from('gate_events')
      .update({ [PICTURE_COLUMN[kind]]: path })
      .eq('id', event.id);
    if (updateError) {
      console.error('[ANPR Picture] Event update failed:', updateError);
      return NextResponse.json({ error: 'Event update failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, path });
  } catch (error: unknown) {
    console.error('[ANPR Picture] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
