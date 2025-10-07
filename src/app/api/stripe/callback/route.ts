import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const tenantId = searchParams.get('state');

    if (!code || !tenantId) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?error=missing_parameters`);
    }

    // Temporarily disabled - Stripe not configured yet
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?error=stripe_not_configured`);

  } catch (error: any) {
    console.error('Stripe Callback Error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments?error=callback_failed`);
  }
}