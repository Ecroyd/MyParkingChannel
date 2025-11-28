// app/api/supplier/v1/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  authenticateSupplierApi,
  SupplierAuthError,
} from '@/lib/supplier/auth';
import { SupplierProduct } from '@/lib/supplier/types';

export async function GET(req: NextRequest) {
  try {
    const rawKey = req.headers.get('x-api-key');
    const auth = await authenticateSupplierApi(rawKey);

    if (!auth.scopes.includes('products')) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Scope products not granted' } },
        { status: 403 }
      );
    }

    const supabase = createAdminClient();

    // For now, return a default product since we don't have a parking_products table yet
    // TODO: Replace with real parking_products table query when available
    const { data: tenantProfile } = await supabase
      .from('tenant_public_profile')
      .select('business_name, airport_code')
      .eq('tenant_id', auth.tenantId)
      .maybeSingle();

    const displayName = tenantProfile?.business_name || 'Car Park';
    const airportCode = tenantProfile?.airport_code || null;

    // Return default product structure
    const products: SupplierProduct[] = [
      {
        id: `default-${auth.tenantId}`,
        code: `DEFAULT_${auth.tenantId}`,
        name: displayName,
        description: 'Standard airport parking',
        location: {
          airport_code: airportCode || undefined,
        },
        min_stay_hours: 24,
        max_stay_days: 60,
        lead_time_hours: 2,
        cancellation_policy: {
          free_until_hours_before: 24,
          fee_percentage_after: 100,
        },
        features: ['cctv', 'fenced', 'park_and_ride'],
        currency: 'GBP',
        status: 'active',
      },
    ];

    return NextResponse.json(products, { status: 200 });
  } catch (err: any) {
    if (err instanceof SupplierAuthError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status }
      );
    }

    console.error('Products handler error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
      { status: 500 }
    );
  }
}
