// app/api/payments/connect/status/route.ts
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getAuthedUserTenantId, getTenantStripeAccountId, setTenantStripeAccountId } from '@/lib/supabase-server';

export async function GET() {
  const tenantId = await getAuthedUserTenantId();
  const { accountId } = await getTenantStripeAccountId(tenantId);
  if (!accountId) return NextResponse.json({ connected: false });

  const acc = await stripe.accounts.retrieve(accountId);

  // Persist a pragmatic "connected" flag when fully ready
  const isConnected = !!(acc.charges_enabled && acc.payouts_enabled && acc.details_submitted);
  if (isConnected) await setTenantStripeAccountId(tenantId, accountId, true);

  return NextResponse.json({
    connected: isConnected,
    id: acc.id,
    charges_enabled: acc.charges_enabled,
    payouts_enabled: acc.payouts_enabled,
    details_submitted: acc.details_submitted,
    requirements: acc.requirements,
  });
}
