// GET /api/admin/anpr/picture?tenantId=&eventId=&kind=plate|scene
// Redirects signed-in staff (ops role and above) to a short-lived signed URL for a gate event's
// picture, so <img src> works without the bucket ever being public. 404 when there is none.

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizedAnprAdmin } from '@/lib/anpr/adminAnprAuth';
import { ANPR_PICTURE_BUCKET, PICTURE_COLUMN, parsePictureKind } from '@/lib/anpr/pictures';

const SIGNED_URL_SECONDS = 300;

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const auth = await resolveAuthorizedAnprAdmin(params.get('tenantId'));
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { tenantId, adminClient } = auth.ctx;

    const eventId = params.get('eventId');
    const kind = parsePictureKind(params.get('kind')) ?? 'plate';
    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });

    const column = PICTURE_COLUMN[kind];
    const { data: event } = await adminClient
      .from('gate_events')
      .select(column)
      .eq('id', eventId)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    const path = (event as Record<string, string | null> | null)?.[column];
    if (!path) return NextResponse.json({ error: 'No picture' }, { status: 404 });

    const { data: signed, error } = await adminClient.storage
      .from(ANPR_PICTURE_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !signed?.signedUrl) return NextResponse.json({ error: 'No picture' }, { status: 404 });

    const res = NextResponse.redirect(signed.signedUrl, 302);
    res.headers.set('Cache-Control', 'private, max-age=240');
    return res;
  } catch (error: unknown) {
    console.error('[ANPR Picture] Admin view error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
