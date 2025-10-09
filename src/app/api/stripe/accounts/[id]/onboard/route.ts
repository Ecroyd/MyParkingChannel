// app/api/stripe/accounts/[id]/onboard/route.ts
import { NextResponse } from 'next/server';
import { stripe, ROOT_URL } from '@/lib/stripe';

type Params = { params: { id: string } };

export async function POST(_: Request, { params }: Params) {
  const { id } = params;

  const link = await stripe.accountLinks.create({
    account: id,
    type: 'account_onboarding',
    return_url: `${ROOT_URL}/admin/connect?account=${id}&step=return`,
    refresh_url: `${ROOT_URL}/admin/connect?account=${id}&step=refresh`,
  });

  return NextResponse.json({ onboardingUrl: link.url });
}
