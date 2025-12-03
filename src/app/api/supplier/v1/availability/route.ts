import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const product_id = searchParams.get('product_id');
  const start_at = searchParams.get('start_at');
  const end_at = searchParams.get('end_at');
  const debug = searchParams.get('debug');

  return NextResponse.json(
    {
      version: 'availability-hard-test-2025-12-03-01',
      message: 'This is the ONLY code path for supplier availability.',
      received: {
        product_id,
        start_at,
        end_at,
        debug,
      },
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
