// app/api/stripe/accounts/[id]/checkout/route.ts
import { NextResponse } from 'next/server';
import { stripe, asConnected, ROOT_URL } from '@/lib/stripe';

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  const { priceData, quantity = 1, applicationFeeAmount = 123 } = await req.json();

  if (!priceData?.currency || !priceData?.unit_amount || !priceData?.product_name) {
    return NextResponse.json(
      { error: 'priceData must include currency, unit_amount, product_name' },
      { status: 400 },
    );
  }

  const session = await stripe.checkout.sessions.create(
    {
      line_items: [
        {
          price_data: {
            currency: priceData.currency,
            unit_amount: Number(priceData.unit_amount),
            product_data: { name: priceData.product_name },
          },
          quantity: Number(quantity),
        },
      ],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: Number(applicationFeeAmount), // your platform fee
      },
      success_url: `${ROOT_URL}/success?session_id={CHECKOUT_SESSION_ID}&acct=${params.id}`,
      cancel_url: `${ROOT_URL}/${params.id}/storefront?cancelled=1`,
    },
    asConnected(params.id),
  );

  return NextResponse.json({ id: session.id, url: session.url });
}
