import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { tenantId, bookingId, amount, currency = 'gbp' } = await req.json();

    if (!tenantId || !bookingId || !amount) {
      return NextResponse.json({ 
        error: 'Missing required parameters: tenantId, bookingId, amount' 
      }, { status: 400 });
    }

    // Temporarily disabled - Stripe not configured yet
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  } catch (error: any) {
    console.error('Payment error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}