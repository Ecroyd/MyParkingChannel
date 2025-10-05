import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs'; // needed for raw body in Next

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')!;
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' })
      .webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const tenantId = (intent.metadata?.tenantId as string) || '';
    const bookingId = (intent.metadata?.bookingId as string) || '';
    const newEndAt = intent.metadata?.newEndAt as string;

    const sb = supabaseAdmin();

    // 1) Update the extension row
    const { data: ext, error: updErr } = await sb
      .from('booking_extensions')
      .update({
        charged_amount_cents: intent.amount_received ?? intent.amount ?? 0,
        stripe_payment_status: 'succeeded',
      })
      .eq('stripe_payment_intent_id', intent.id)
      .select('booking_id, quote_amount_cents, new_end_at')
      .single();

    if (!updErr && ext) {
      // 2) Update the booking (end_at & money_charged)
      // Get current money_charged (numeric), add quoted (int cents)/100
      const { data: booking } = await sb
        .from('bookings')
        .select('money_charged')
        .eq('id', ext.booking_id)
        .single();

      const currentCharged = Number(booking?.money_charged ?? 0);
      const addAmount = Number(ext.quote_amount_cents ?? 0) / 100;

      await sb
        .from('bookings')
        .update({
          end_at: ext.new_end_at || newEndAt,
          money_charged: currentCharged + addAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ext.booking_id);
    }
  }

  return NextResponse.json({ received: true });
}
