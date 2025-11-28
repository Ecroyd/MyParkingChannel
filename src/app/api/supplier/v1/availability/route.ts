// app/api/supplier/v1/availability/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateSupplierApi,
  SupplierAuthError,
} from '@/lib/supplier/auth';
import { AvailabilityResponse } from '@/lib/supplier/types';

/**
 * NOTE:
 * This uses a very simple stubbed pricing/availability implementation.
 * Replace the "TODO" block with our real pricing engine and capacity logic.
 */
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

    const product_id = searchParams.get('product_id');
    const start_at = searchParams.get('start_at');
    const end_at = searchParams.get('end_at');
    const currency = searchParams.get('currency') ?? 'GBP';
    const passengers = searchParams.get('passengers');

    if (!product_id || !start_at || !end_at) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'product_id, start_at and end_at are required',
          },
        },
        { status: 400 }
      );
    }

    // TODO: plug into our real pricing/capacity engine.
    // For now, use a basic placeholder implementation.
    const startDate = new Date(start_at);
    const endDate = new Date(end_at);
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.max(
      1,
      Math.round((endDate.getTime() - startDate.getTime()) / msPerDay)
    );

    const basePricePerDay = 10; // placeholder
    const base_price = basePricePerDay * days;

    const response: AvailabilityResponse = {
      product_id,
      start_at,
      end_at,
      currency,
      availability_status: 'available',
      remaining_capacity: null, // set real capacity if we track it
      pricing: {
        rate_plan: 'standard',
        days,
        base_price,
        surcharges: [],
        discounts: [],
        total_price: base_price,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err: any) {
    if (err instanceof SupplierAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }

    console.error('Availability handler error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
      { status: 500 }
    );
  }
}
