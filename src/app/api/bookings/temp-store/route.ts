import { NextResponse } from 'next/server';

/**
 * Retired. This public route let anyone read customer details or overwrite the stay dates
 * of a paid checkout. Checkout and the Stripe webhook now use
 * src/lib/bookings/tempBookingStore.ts directly.
 */
function gone() {
  return NextResponse.json({ error: 'This endpoint has been retired' }, { status: 410 });
}

export const GET = gone;
export const POST = gone;
