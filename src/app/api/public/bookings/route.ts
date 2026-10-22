import { NextResponse } from 'next/server';

/**
 * Retired. It inserted unpaid 'reserved' bookings for any tenant from unauthenticated request data,
 * with no availability check. Nothing in the app (src/, public/) calls it; public bookings are
 * created through Stripe checkout and the Stripe webhook.
 */
export async function POST() {
  return NextResponse.json({ error: 'This endpoint has been retired' }, { status: 410 });
}
