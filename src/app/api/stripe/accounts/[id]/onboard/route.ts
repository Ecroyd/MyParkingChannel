// app/api/stripe/accounts/[id]/onboard/route.ts
import { NextResponse } from 'next/server';
import { stripe, ROOT_URL } from '@/lib/stripe';
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

type Params = { params: Promise<{ id: string }> };

export async function POST(_: Request, { params }: Params) {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  const { id } = await params;

  const link = await stripe.accountLinks.create({
    account: id,
    type: 'account_onboarding',
    return_url: `${ROOT_URL}/admin/connect?account=${id}&step=return`,
    refresh_url: `${ROOT_URL}/admin/connect?account=${id}&step=refresh`,
  });

  return NextResponse.json({ onboardingUrl: link.url });
}
