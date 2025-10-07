import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // Temporarily disabled - Stripe not configured yet
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}