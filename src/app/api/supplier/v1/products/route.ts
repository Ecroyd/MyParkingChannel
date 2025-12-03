// app/api/supplier/v1/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  authenticateSupplierApi,
  SupplierAuthError,
} from '@/lib/supplier/auth';

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

    // Load all active products for this tenant
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, code, name, description, is_active')
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true);

    if (productsError) {
      console.error('Products query error:', productsError);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to load products' } },
        { status: 500 }
      );
    }

    if (!products || products.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    // For each product, load the rate plan
    const productsWithRatePlans = await Promise.all(
      products.map(async (product) => {
        const { data: ratePlan, error: ratePlanError } = await supabase
          .from('product_rate_plans')
          .select('id, base_price_cents, currency, billing_type')
          .eq('product_id', product.id)
          .limit(1)
          .maybeSingle();

        if (ratePlanError) {
          console.error(`Rate plan query error for product ${product.id}:`, ratePlanError);
        }

        return {
          id: product.id,
          code: product.code,
          name: product.name,
          description: product.description || null,
          rate_plan: ratePlan
            ? {
                base_price: ratePlan.base_price_cents / 100,
                currency: ratePlan.currency,
                billing_type: ratePlan.billing_type,
              }
            : null,
        };
      })
    );

    return NextResponse.json(productsWithRatePlans, { status: 200 });
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
