// src/app/api/internal/suppliers/cavu/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getArrivalsForDate, getOperators } from '@/lib/suppliers/cavu';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: 'Missing tenantId' },
      { status: 400 }
    );
  }

  try {
    const config = await getCavuConfigForTenant(tenantId);
    if (!config) {
      return NextResponse.json(
        { ok: false, error: 'No CAVU config for this tenant' },
        { status: 400 }
      );
    }

    console.log('[CAVU TEST] Config loaded:', {
      operator_id: config.operator_id,
      has_private_key: !!config.operator_private_key,
      has_subscription_key: !!config.subscription_key,
    });

    // Today in YYYY-MM-DD (UTC is fine for a basic test)
    const today = new Date().toISOString().slice(0, 10);
    console.log('[CAVU TEST] Testing for date:', today);

    // 1) Always call /operators – we KNOW this works
    console.log('[CAVU TEST] Calling getOperators...');
    const operators = await getOperators(config);
    console.log('[CAVU TEST] getOperators returned:', {
      isArray: Array.isArray(operators),
      length: Array.isArray(operators) ? operators.length : 'not an array',
      firstItem: Array.isArray(operators) && operators.length > 0 ? operators[0] : null,
    });
    const first = Array.isArray(operators) ? operators[0] : null;

    const operatorId =
      first?.Id ?? first?.OperatorID ?? config.operator_id;
    const operatorName = first?.Name ?? first?.OperatorName ?? 'Unknown operator';

    // 2) Try arrivals, but don't kill the test if it 404s
    let arrivalsCount: number | null = null;

    try {
      const arrivals = await getArrivalsForDate(config, today);
      arrivalsCount = Array.isArray(arrivals) ? arrivals.length : 0;
    } catch (err: any) {
      console.warn('[CAVU TEST] Arrivals check failed (non-fatal):', err?.message ?? err);
      // leave arrivalsCount as null
    }

    return NextResponse.json({
      ok: true,
      operatorId,
      operatorName,
      date: today,
      arrivalsCount,
    });
  } catch (err: any) {
    console.error('[CAVU TEST] error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
