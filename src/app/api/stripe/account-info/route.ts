import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
    }

    // Temporarily disabled - Stripe not configured yet
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  } catch (error: any) {
    console.error('Stripe Account Info Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}