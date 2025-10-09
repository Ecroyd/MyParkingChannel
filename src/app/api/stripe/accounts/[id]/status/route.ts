// app/api/stripe/accounts/[id]/status/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  const account = await stripe.accounts.retrieve(id);

  // Minimal status snapshot for UI:
  const status = {
    id: account.id,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    requirements: account.requirements,
  };

  return NextResponse.json(status);
}
