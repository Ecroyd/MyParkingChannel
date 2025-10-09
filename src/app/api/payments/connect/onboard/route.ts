// app/api/payments/connect/onboard/route.ts
import { NextResponse } from 'next/server';
import { stripe, ROOT_URL } from '@/lib/stripe';
import { getAuthedUserTenantId, getTenantStripeAccountId, setTenantStripeAccountId } from '@/lib/supabase-server';

export async function POST() {
  const tenantId = await getAuthedUserTenantId();

  let { accountId } = await getTenantStripeAccountId(tenantId);
  if (!accountId) {
    // Create controller-based connected account – per your spec
    const acct = await stripe.accounts.create({
      controller: {
        fees: { payer: 'account' },
        losses: { payments: 'stripe' },
        stripe_dashboard: { type: 'full' },
      },
    });
    accountId = acct.id;
    await setTenantStripeAccountId(tenantId, accountId, false);
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    return_url: `${ROOT_URL}/admin/payments?step=return`,
    refresh_url: `${ROOT_URL}/admin/payments?step=refresh`,
  });

  return NextResponse.json({ accountId, url: link.url });
}
