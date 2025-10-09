// app/api/stripe/accounts/create/route.ts
import { NextResponse } from 'next/server';
import { stripe, ROOT_URL } from '@/lib/stripe';

export async function POST() {
  // Create a controller-based connected account (no top-level type!)
  // See: the instructions you pasted.
  const account = await stripe.accounts.create({
    controller: {
      fees: { payer: 'account' },              // connected account pays fees
      losses: { payments: 'stripe' },          // Stripe covers payment disputes/losses
      stripe_dashboard: { type: 'full' },      // connected gets full dashboard
    },
  });

  // Create an onboarding link for that account.
  const link = await stripe.accountLinks.create({
    account: account.id,
    type: 'account_onboarding',
    return_url: `${ROOT_URL}/admin/connect?account=${account.id}&step=return`,
    refresh_url: `${ROOT_URL}/admin/connect?account=${account.id}&step=refresh`,
  });

  return NextResponse.json({ accountId: account.id, onboardingUrl: link.url });
}
