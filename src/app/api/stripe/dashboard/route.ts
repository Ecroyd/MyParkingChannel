import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { tenantId } = await req.json();

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID required' }, { status: 400 });
    }

    // Temporarily disabled - Stripe not configured yet
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  } catch (error: any) {
    console.error('Stripe Dashboard Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}