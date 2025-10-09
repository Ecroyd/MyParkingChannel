// app/api/stripe/accounts/[id]/products/route.ts
import { NextResponse } from 'next/server';
import { stripe, asConnected } from '@/lib/stripe';

type Params = { params: { id: string } };

// List products for storefront
export async function GET(_: Request, { params }: Params) {
  const products = await stripe.products.list({ limit: 20 }, asConnected(params.id));
  // Include prices (default_price is an ID; fetch price objects)
  const priceIds = products.data
    .map(p => p.default_price)
    .filter(Boolean) as string[];

  const prices = priceIds.length
    ? await stripe.prices.list({ limit: 100, expand: ['data.product'] }, asConnected(params.id))
    : null;

  return NextResponse.json({ products: products.data, prices: prices?.data ?? [] });
}

// Create a product (name/description/price/currency)
export async function POST(req: Request, { params }: Params) {
  const body = await req.json().catch(() => ({}));
  const { name, description, priceInCents, currency } = body || {};

  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });
  if (!priceInCents) return NextResponse.json({ error: 'Missing priceInCents' }, { status: 400 });
  if (!currency) return NextResponse.json({ error: 'Missing currency' }, { status: 400 });

  const product = await stripe.products.create(
    {
      name,
      description,
      default_price_data: {
        unit_amount: Number(priceInCents),
        currency,
      },
    },
    asConnected(params.id),
  );

  return NextResponse.json({ product });
}
