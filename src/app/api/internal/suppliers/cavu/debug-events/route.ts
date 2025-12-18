// src/app/api/internal/suppliers/cavu/debug-events/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getEventsByAge } from '@/lib/suppliers/cavu';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get('tenantId');
  const hoursParam = searchParams.get('hours');
  const limitParam = searchParams.get('limit');

  if (!tenantId) {
    return NextResponse.json(
      { ok: false, error: 'Missing required query param: tenantId' },
      { status: 400 }
    );
  }

  const hours = hoursParam ? Number(hoursParam) : 2;
  const limit = limitParam ? Number(limitParam) : 10;

  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Invalid hours parameter (must be a positive number)' },
      { status: 400 }
    );
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return NextResponse.json(
      { ok: false, error: 'Invalid limit parameter (must be a positive number)' },
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

    const events = await getEventsByAge(config, hours);

    return NextResponse.json({
      ok: true,
      hours,
      events: events.slice(0, limit),
    });
  } catch (err: any) {
    console.error('[CAVU DEBUG EVENTS] error', err);
    return NextResponse.json(
      { ok: false, error: err.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
