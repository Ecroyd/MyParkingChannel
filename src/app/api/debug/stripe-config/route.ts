import { NextResponse } from 'next/server';
import { requirePlatformAdminApi } from '@/lib/auth/apiGuards';

export async function GET() {
  const guard = await requirePlatformAdminApi();
  if (guard.response) return guard.response;
  const config = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? 'Set (hidden)' : 'Not set',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'Not set',
    NODE_ENV: process.env.NODE_ENV || 'Not set',
  };

  return NextResponse.json(config);
}

