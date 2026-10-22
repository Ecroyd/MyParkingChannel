import { NextResponse } from 'next/server';

/**
 * Retired. It created "paid" bookings from unauthenticated request data without checking
 * Stripe. Paid bookings are created only by the Stripe webhook (checkout.session.completed).
 * Its only caller was the legacy /success?tenant=&reference= fallback, which no checkout
 * links to any more; that component refreshes and waits for the webhook on a non-OK reply.
 */
export async function POST() {
  return NextResponse.json({ error: 'This endpoint has been retired' }, { status: 410 });
}
