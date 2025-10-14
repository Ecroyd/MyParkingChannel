// app/api/stripe/validate-env/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const required = [
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_ROOT_URL'
  ];

  const optional = [
    'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_CLIENT_ID_TEST',
    'STRIPE_CLIENT_ID_LIVE',
    'STRIPE_WEBHOOK_SECRET'
  ];

  const missing = required.filter(key => !process.env[key]);
  const present = required.filter(key => process.env[key]);
  const optionalPresent = optional.filter(key => process.env[key]);

  return NextResponse.json({
    status: missing.length === 0 ? 'ready' : 'missing_config',
    required: {
      missing,
      present
    },
    optional: {
      present: optionalPresent,
      missing: optional.filter(key => !process.env[key])
    },
    message: missing.length === 0 
      ? 'All required environment variables are set. Stripe Connect is ready to use.'
      : `Missing required variables: ${missing.join(', ')}. Please set these in your environment.`
  });
}
