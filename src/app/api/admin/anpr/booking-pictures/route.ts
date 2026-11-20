// POST /api/admin/anpr/booking-pictures  { tenantId, bookingIds: string[] }
// For the Today board: the latest pictured arrival and departure camera read of each booking,
// as { pictures: { [bookingId]: { in?, out? } } }. Ops role and above. Empty when the site keeps
// no pictures.

import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizedAnprAdmin } from '@/lib/anpr/adminAnprAuth';
import { fetchBookingPictures } from '@/lib/anpr/pictures';

const MAX_BOOKINGS = 1000;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { tenantId?: string; bookingIds?: unknown };
    const auth = await resolveAuthorizedAnprAdmin(body.tenantId ?? null);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { tenantId, adminClient } = auth.ctx;

    const ids = Array.isArray(body.bookingIds)
      ? body.bookingIds.filter((id): id is string => typeof id === 'string').slice(0, MAX_BOOKINGS)
      : [];
    if (ids.length === 0) return NextResponse.json({ pictures: {} });

    return NextResponse.json({ pictures: await fetchBookingPictures(adminClient, tenantId, ids) });
  } catch (error: unknown) {
    console.error('[ANPR Booking Pictures] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
