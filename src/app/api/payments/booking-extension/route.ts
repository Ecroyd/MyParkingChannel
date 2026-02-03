// app/api/payments/booking-extension/route.ts
import { NextResponse } from 'next/server';
import { stripe, useConnected, ROOT_URL } from '@/lib/stripe';
import { getServerSupabase, getAuthedUserTenantId, getTenantStripeAccountId } from '@/lib/supabase-server';

/**
 * POST body:
 * {
 *   booking_id: string,
 *   new_end_at: string,                // ISO
 *   quote_amount_cents: number,        // your UI calc; or compute server-side if you prefer
 *   application_fee_cents?: number
 * }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { booking_id, new_end_at, quote_amount_cents, application_fee_cents = 0 } = body;

  if (!booking_id || !new_end_at || !quote_amount_cents) {
    return NextResponse.json({ error: 'booking_id, new_end_at, quote_amount_cents required' }, { status: 400 });
  }

  const tenantId = await getAuthedUserTenantId();
  const supabase = await getServerSupabase();

  const { data: b } = await supabase
    .from('bookings')
    .select('id, tenant_id, end_at, customer_name, reference')
    .eq('id', booking_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const { accountId } = await getTenantStripeAccountId(tenantId);
  if (!accountId) return NextResponse.json({ error: 'Stripe not connected' }, { status: 400 });

  const currencyRow = await supabase
    .from('tenant_pricing').select('currency').eq('tenant_id', tenantId).maybeSingle();
  const currency = (currencyRow.data?.currency ?? 'GBP').toLowerCase();

  // Create Session to take extension payment
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [{
        price_data: {
          currency,
          unit_amount: Number(quote_amount_cents),
          product_data: { name: `Extension for ${b.reference}` },
        },
        quantity: 1,
      }],
      metadata: {
        tenant_id: tenantId,
        temp_booking_id: booking_id,
        reference: b.reference,
      },
      payment_intent_data: {
        application_fee_amount: Number(application_fee_cents) || 0,
        metadata: {
          tenant_id: tenantId,
          temp_booking_id: booking_id,
          reference: b.reference,
          kind: 'extension',
        },
      },
      success_url: `${ROOT_URL}/admin/bookings/${booking_id}?extended=1`,
      cancel_url: `${ROOT_URL}/admin/bookings/${booking_id}?cancelled=1`,
    },
    useConnected(accountId),
  );

  // create pending extension row
  await supabase.from('booking_extensions').insert({
    tenant_id: tenantId,
    booking_id,
    prev_end_at: b.end_at,
    new_end_at,
    quote_amount_cents: Number(quote_amount_cents),
    charged_amount_cents: 0,
    currency,
    note: 'Awaiting payment',
    stripe_payment_intent_id: null,
    stripe_payment_status: 'pending',
  });

  return NextResponse.json({ url: session.url });
}
