// src/app/api/internal/suppliers/cavu/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getArrivalsForDate, getOperatorDetails } from '@/lib/suppliers/cavu';

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

    // Today in YYYY-MM-DD (UTC is fine for a basic test)
    const today = new Date().toISOString().slice(0, 10);

    const [operatorDetails, arrivals] = await Promise.all([
      getOperatorDetails(config),
      getArrivalsForDate(config, today),
    ]);

    // XML will likely be deserialised into a JS object by fetch → text → xml2js if they had; 
    // but the CAVU API often returns JSON for us – we'll just safely access Id/Name
    const operatorId =
      operatorDetails?.Id ??
      operatorDetails?.OperatorID ??
      config.operator_id;
    const operatorName =
      operatorDetails?.Name ??
      operatorDetails?.OperatorName ??
      'Unknown operator';

    return NextResponse.json({
      ok: true,
      operatorId,
      operatorName,
      date: today,
      arrivalsCount: Array.isArray(arrivals) ? arrivals.length : 0,
    });
  } catch (err: any) {
    console.error('[CAVU TEST] error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}

