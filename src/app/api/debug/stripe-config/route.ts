import { NextResponse } from 'next/server';

export async function GET() {
  const config = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? 'Set (hidden)' : 'Not set',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'Not set',
    NODE_ENV: process.env.NODE_ENV || 'Not set',
  };

  return NextResponse.json(config);
}

