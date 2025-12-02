// app/api/supplier/v1/availability/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateSupplierApi,
  SupplierAuthError,
} from '@/lib/supplier/auth';
import { calculateAvailability } from '@/lib/availability/engine';

export async function GET(req: NextRequest) {
  try {
    const rawKey = req.headers.get('x-api-key');
    const auth = await authenticateSupplierApi(rawKey);

    if (!auth.scopes.includes('availability')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Scope availability not granted',
          },
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);

    const product_id = searchParams.get('product_id') ?? 'tenant_pool';
    const start_at = searchParams.get('start_at');
    const end_at = searchParams.get('end_at');
    const currency = searchParams.get('currency') ?? 'GBP';

    if (!start_at || !end_at) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'start_at and end_at are required',
          },
        },
        { status: 400 }
      );
    }

    const availability = await calculateAvailability({
      tenantId: auth.tenantId,
      startAt: start_at,
      endAt: end_at,
      currency,
      channel: 'partner',
      channelCode: auth.channelCode, // Use channel from API key
    });

    // keep product_id from request in response for consistency
    return NextResponse.json(
      { ...availability, product_id },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof SupplierAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }

    console.error('Supplier availability error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
      { status: 500 }
    );
  }
}
