// app/api/payments/public-checkout/route.ts
import { NextResponse } from 'next/server';
import { stripe, useConnected, ROOT_URL } from '@/lib/stripe';
import { getServerSupabase, getTenantStripeAccountId } from '@/lib/supabase-server';
import { getQuoteCents } from '@/lib/pricing';

/**
 * POST body:
 * {
 *   tenant_id: string,              // required for public bookings
 *   start_at: string, end_at: string, // ISO strings for new quote
 *   customer_name?: string,
 *   reference?: string,                 // optional, displayed in product name
 *   application_fee_cents?: number      // optional platform fee; default 0
 * }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    tenant_id,
    start_at,
    end_at,
    customer_name,
    reference,
    application_fee_cents = 0,
  } = body;

  if (!tenant_id || !start_at || !end_at) {
    return NextResponse.json({ error: 'tenant_id, start_at, end_at required' }, { status: 400 });
  }

  const { accountId } = await getTenantStripeAccountId(tenant_id);
  if (!accountId) return NextResponse.json({ error: 'Stripe not connected for this tenant' }, { status: 400 });

  const supabase = await getServerSupabase();

  // Get quote for the booking
  const q = await getQuoteCents(tenant_id, start_at, end_at);
  const amount_cents = q.amount_cents;
  const currency = q.currency;

  if (amount_cents <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

  const productName = `Parking (${reference ?? 'new'})`;
  const descName = customer_name ? `Customer: ${customer_name}` : undefined;

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [{
        price_data: {
          currency,
          unit_amount: amount_cents,
          product_data: { name: productName, description: descName },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: Number(application_fee_cents) || 0,
        metadata: {
          tenant_id: tenant_id,
          booking_reference: reference ?? '',
        },
      },
      success_url: `${ROOT_URL}/success?tenant=${tenant_id}`,
      cancel_url: `${ROOT_URL}/site/${tenant_id}?cancelled=1`,
    },
    useConnected(accountId),
  );

  return NextResponse.json({ url: session.url });
}
