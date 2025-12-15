import { NextRequest, NextResponse } from 'next/server';
import { getCavuConfigForTenant } from '@/lib/suppliers/getTenantSupplierConfig';
import { getBookingDetails } from '@/lib/suppliers/cavu';

// GET /api/internal/suppliers/cavu/debug-booking?tenantId=...&reference=...
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const reference = req.nextUrl.searchParams.get('reference');

  if (!tenantId || !reference) {
    return NextResponse.json(
      { ok: false, error: 'Missing tenantId or reference' },
      { status: 400 }
    );
  }

  const config = await getCavuConfigForTenant(tenantId);
  if (!config) {
    return NextResponse.json(
      { ok: false, error: 'No CAVU config for tenant' },
      { status: 400 }
    );
  }

  try {
    const booking = await getBookingDetails(config, reference);
    return NextResponse.json({ ok: true, reference, booking });
  } catch (err: any) {
    console.error('[CAVU DEBUG BOOKING] error', err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

