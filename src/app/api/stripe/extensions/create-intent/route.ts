import { NextResponse } from 'next/server';
import { supabaseAdmin, getServerSupabase } from '@/lib/supabase/server';
import { getTenantStripeClient, getTenantStripeKeys } from '@/lib/stripe/getTenantStripe';

export async function POST(req: Request) {
  const { bookingId, tenantId, prevEndAt, newEndAt, note, manualAmountCents } = await req.json();

  const sbAdmin = supabaseAdmin();
  const stripe = await getTenantStripeClient(tenantId);
  const { publishableKey } = await getTenantStripeKeys(tenantId);

  let amountCents = manualAmountCents;

  if (!amountCents || amountCents <= 0) {
    const { data: quoted, error: rpcErr } = await sbAdmin.rpc('quote_extension_cents', {
      p_tenant_id: tenantId,
      p_prev_end_at: prevEndAt,
      p_new_end_at: newEndAt,
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 });
    amountCents = quoted ?? 0;
  }

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'gbp',
    automatic_payment_methods: { enabled: true },
    metadata: {
      tenantId,
      bookingId,
      prevEndAt,
      newEndAt,
      note: note ?? '',
    },
  });

  const { error: insertErr } = await sbAdmin.from('booking_extensions').insert({
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    booking_id: bookingId,
    prev_end_at: prevEndAt,
    new_end_at: newEndAt,
    quote_amount_cents: amountCents,
    charged_amount_cents: 0,
    stripe_payment_status: 'pending',
    stripe_payment_intent_id: intent.id,
    currency: 'GBP',
    note,
    created_at: new Date().toISOString(),
  });

  if (insertErr) {
    // best effort to cancel intent if our DB insert failed
    try { await stripe.paymentIntents.cancel(intent.id); } catch {}
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  return NextResponse.json({
    clientSecret: intent.client_secret,
    publishableKey, // let client confirm with the right key
    amountCents,
  });
}
